import { describe, expect, test } from 'bun:test';
import {
  Compiler,
  CompoundTagCollisionError,
  ImplicationCycleError,
  ProductTagCollisionError,
  RuleExecutionError,
  compile,
  components,
  compound,
  field,
  flag,
  links,
  query,
  relation,
  rule,
  serialize,
  tag,
  world,
} from '../src/index.js';

describe('esm-tagfactory core API', () => {
  test('original Hydrus scenarios compose cleanly', () => {
    const C = components({
      Color: flag(),
      Colorable: flag(),
      Species: flag(),
      Combinable: flag(),
      Super: links(),
      BodySuper: links(),
      Order: field<number>(),
      Standalone: field<string>(),
    });

    const w = world({
      blue: [C.Color],
      navy: [C.Color, C.Super('blue')],
      hair: [C.Colorable],
      body: [C.Colorable],
      fur: [C.Colorable, C.BodySuper('body')],
      dragon: [C.Species, C.Super('mythological_scalie')],
      mythological_scalie: [C.Species, C.Super('mythological_creature', 'scalie')],
      mythological_creature: [C.Species],
      scalie: [C.Species],
      a: [C.Combinable, C.Order(1), C.Standalone('namespace:a')],
      b: [C.Combinable, C.Order(2)],
      c: [C.Combinable, C.Order(3)],
    });

    const versus = compound.symmetric({
      members: C.Combinable,
      orderBy: C.Order,
      render: tag.join('_vs_'),
    });

    expect(versus.normalize(w, ['b', 'a']).tag).toBe('a_vs_b');
    expect([...versus.compounds(w)].map((value) => value.tag)).toEqual([
      'a_vs_a', 'a_vs_b', 'a_vs_c', 'b_vs_b', 'b_vs_c', 'c_vs_c',
    ]);

    const standalone = tag.from(C.Standalone, tag.id);
    const graph = compile(
      w,
      rule.product({
        axes: [
          { members: C.Color, parents: C.Super },
          { members: C.Colorable, parents: C.BodySuper, imply: true },
        ],
        render: tag.join('_'),
      }),
      rule.hierarchy({
        members: C.Species,
        parents: C.Super,
        child: tag.namespace('species'),
        parentScope: C.Species,
      }),
      rule.compound({
        domain: versus,
        decompose: (member, currentWorld, { index }) =>
          index === 0 ? standalone(member, currentWorld) : member,
      }),
    );

    expect(graph.has('navy_hair', 'blue_hair')).toBe(true);
    expect(graph.has('blue_hair', 'hair')).toBe(true);
    expect(graph.has('navy_fur', 'navy_body')).toBe(true);
    expect(graph.has('navy_fur', 'blue_fur')).toBe(true);
    expect(graph.has('species:dragon', 'species:mythological_scalie')).toBe(true);
    expect(graph.has('a_vs_b', 'namespace:a')).toBe(true);
    expect(graph.has('a_vs_b', 'b')).toBe(true);
  });

  test('product is N-dimensional', () => {
    const C = components({ A: flag(), B: flag(), C: flag() });
    const w = world({ a1: [C.A], a2: [C.A], b: [C.B], c: [C.C] });
    const graph = compile(w, rule.product({
      axes: [
        { members: C.A },
        { members: C.B },
        { members: C.C },
      ],
      render: tag.join('/'),
    }));
    // No parent edges are requested, but rendering/collision traversal succeeds for 3D tuples.
    expect(graph.size).toBe(0);
  });

  test('relations compose and queries remain ordinary TypeScript', () => {
    const C = components({ Node: flag(), Disabled: flag(), Parent: links(), OtherParent: links() });
    const w = world({
      a: [C.Node, C.Parent('b')],
      b: [C.Node, C.OtherParent('c')],
      c: [C.Node],
      hidden: [C.Node, C.Disabled],
    });
    const active = query(C.Node).without(C.Disabled);
    const parents = relation(C.Parent).or(C.OtherParent).transitive();
    expect(active.ids(w)).toEqual(['a', 'b', 'c']);
    expect(parents.targets('a', w)).toEqual(['b', 'c']);
  });

  test('custom rules participate in fixed-point world derivation', () => {
    const C = components({ Seed: flag(), Derived: flag() });
    const w = world({ x: [C.Seed] });
    const derive = rule.custom('derive', ({ world: currentWorld }) => {
      for (const entity of currentWorld.entities()) {
        if (entity.has(C.Seed)) entity.patch(C.Derived);
      }
    });
    const materialize = rule.custom('materialize', ({ world: currentWorld, emit }) => {
      for (const entity of currentWorld.entities()) {
        if (entity.has(C.Derived)) emit(`derived:${entity.id}`, entity.id);
      }
    });
    const result = new Compiler().run(w, derive, materialize);
    expect(result.graph.has('derived:x', 'x')).toBe(true);
    expect(result.passes).toBeGreaterThanOrEqual(2);
  });

  test('compound and product tag collisions fail loudly', () => {
    const C = components({ X: flag() });
    const w = world({ a: [C.X], b: [C.X] });
    const domain = compound.symmetric({ members: C.X, render: () => 'same' });
    expect(() => [...domain.compounds(w)]).toThrow(CompoundTagCollisionError);

    try {
      compile(w, rule.product({
        axes: [{ members: C.X }],
        render: () => 'same',
      }));
      throw new Error('expected product collision');
    } catch (error) {
      expect(error).toBeInstanceOf(RuleExecutionError);
      expect((error as RuleExecutionError).cause).toBeInstanceOf(ProductTagCollisionError);
    }
  });

  test('graph explains provenance, reduces transitives and rejects cycles', () => {
    const C = components({ Node: flag(), Parent: links() });
    const w = world({ a: [C.Node, C.Parent('b', 'c')], b: [C.Node, C.Parent('c')], c: [C.Node] });
    const graph = compile(w, rule.hierarchy({ members: C.Node, parents: C.Parent }));
    expect(serialize.text(graph)).toBe('a -> b\nb -> c');
    const proof = graph.why('a', 'c');
    expect(proof?.path[0]).toBe('a');
    expect(proof?.path.at(-1)).toBe('c');
    expect(proof?.edges[0]?.provenance[0]?.rule).toContain('hierarchy');
    expect(() => graph.add('c', 'a')).toThrow(ImplicationCycleError);
  });
});
