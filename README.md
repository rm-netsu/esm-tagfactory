# esm-tagfactory

[![CI](https://github.com/rm-netsu/esm-tagfactory/actions/workflows/ci.yml/badge.svg)](https://github.com/rm-netsu/esm-tagfactory/actions/workflows/ci.yml)

A small, dependency-free TypeScript/ESM framework for deriving Hydrus tag-parent implication DAGs from typed semantic data.

`esm-tagfactory` intentionally has no compatibility layer for the earlier prototypes. Its public API is built around a small set of orthogonal concepts:

- **components** describe typed facts;
- **World** stores semantic entities independently of Hydrus spelling;
- **queries** describe entity sets;
- **relations** describe semantic links, stored or computed;
- **tag projections** materialize semantic identities into Hydrus tags;
- **compound domains** model ordered, symmetric or custom compound identities;
- **rules** lift semantic structure into Hydrus implications;
- **Compiler** stabilizes derived world state and materializes a fresh graph;
- **ImplicationGraph** validates cycles, keeps provenance, reduces transitive edges and explains proofs.

There is no ontology text DSL and no required global registry. The ontology is ordinary typed TypeScript data.

## Install

```sh
bun add esm-tagfactory
```

The emitted package is standard ESM with no runtime dependencies and targets Bun and Node.js 20+.

## Quick start

```ts
import {
  compile,
  components,
  compound,
  field,
  flag,
  links,
  rule,
  serialize,
  tag,
  world,
} from 'esm-tagfactory';

const C = components({
  Color: flag(),
  Colorable: flag(),
  Species: flag(),
  Combinable: flag(),

  Super: links(),
  BodySuper: links(),
  Order: field<number>(),
  StandaloneTag: field<string>(),
  Fragment: field<string>(),
});

const ontology = world({
  blue: [C.Color],
  navy: [C.Color, C.Super('blue')],

  hair: [C.Colorable],
  body: [C.Colorable],
  fur: [C.Colorable, C.BodySuper('body')],

  dragon: [C.Species, C.Super('mythological_scalie')],
  mythological_scalie: [C.Species, C.Super('mythological_creature', 'scalie')],
  mythological_creature: [C.Species],
  scalie: [C.Species],

  a: [C.Combinable, C.Order(1), C.StandaloneTag('namespace:a'), C.Fragment('a')],
  b: [C.Combinable, C.Order(2), C.Fragment('b')],
  c: [C.Combinable, C.Order(3), C.Fragment('c')],
});

const versus = compound.symmetric({
  members: C.Combinable,
  orderBy: C.Order,
  render: tag.join('_vs_', tag.from(C.Fragment, tag.id)),
});

const standalone = tag.from(C.StandaloneTag, tag.id);

const graph = compile(
  ontology,

  rule.product({
    axes: [
      { name: 'color', members: C.Color, parents: C.Super },
      { name: 'thing', members: C.Colorable, parents: C.BodySuper, imply: tag.id },
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
    decompose: (member, world, { index }) =>
      index === 0 ? standalone(member, world) : member,
  }),
);

console.log(serialize.text(graph));
```

This can derive, among others:

```text
navy_hair -> blue_hair
blue_hair -> hair
navy_fur -> blue_fur
navy_fur -> navy_body
species:dragon -> species:mythological_scalie
a_vs_b -> namespace:a
a_vs_b -> b
```

And permutation-independent compounds have one canonical spelling:

```ts
versus.normalize(ontology, ['b', 'a']).tag; // "a_vs_b"
versus.normalize(ontology, ['c', 'a']).tag; // "a_vs_c"
```

## Typed components with almost no ceremony

`components()` binds runtime diagnostic names from TypeScript object keys while preserving exact types:

```ts
const C = components({
  Color: flag(),
  Order: field<number>(),
  Super: links(),
});
```

Usage is intentionally asymmetric in a useful way:

```ts
C.Color;            // marker trait
C.Order(20);        // typed value trait
C.Super('blue');    // append/unique relation trait
C.Super.replace('blue'); // replacement semantics when required
```

So static data stays compact:

```ts
const ontology = world({
  blue: [C.Color],
  navy: [C.Color, C.Order(20), C.Super('blue')],
});
```

And progressive construction uses the same traits rather than a second authoring DSL:

```ts
ontology.patch('navy', C.Order(30), C.Super('azure'));
ontology.entity('navy').patch(C.Color);
```

Reads remain fully typed:

```ts
const order = ontology.get('navy', C.Order); // number | undefined
const parents = ontology.get('navy', C.Super); // readonly string[] | undefined
```

## Queries are reusable semantic sets

Any component can be used directly as an entity set: membership means presence of that component.

For more expressive roles:

```ts
const publicColors = query(C.Color, C.Enabled)
  .without(C.Internal)
  .where((entity) => !entity.id.startsWith('_'), 'public-id')
  .named('public-colors');
```

Queries are ordinary objects and expose:

```ts
publicColors.has(ontology, 'navy');
publicColors.ids(ontology);
publicColors.entities(ontology);
```

No dedicated marker has to be invented merely because one rule needs a narrower view of the ontology.

## Relations: storage and derived semantics share one interface

A `links()` component is already a relation source. No wrapper is required:

```ts
rule.hierarchy({
  members: C.Species,
  parents: C.Super,
});
```

Wrap it only when composition is useful:

```ts
const supers = relation(C.Super)
  .or(C.LegacySuper)
  .filter((source, target) => source !== target)
  .transitive();
```

Computed relations use the same abstraction:

```ts
const inferred = relation('inferred-super', (entity, world) => {
  return deriveParents(entity, world);
});
```

Relations also support `inverse()`.

## Tag spelling is a projection, not semantic identity

The internal entity id never has to equal the Hydrus tag used by a rule.

```ts
tag.id;
tag.namespace('species');
tag.from(C.StandaloneTag);
tag.from(C.StandaloneTag, tag.id); // fallback
```

Projections compose:

```ts
const lowerSpecies = tag.map(
  tag.namespace('species'),
  (value) => value.toLowerCase(),
);
```

Conditional views are also possible:

```ts
const external = tag.when(
  C.Legacy,
  tag.namespace('legacy'),
  tag.id,
);
```

And compound/product renderers can reuse projections:

```ts
const renderPair = tag.join('_vs_', tag.from(C.Fragment, tag.id));
```

This keeps these concepts independent:

```text
semantic entity:       a
compound fragment:     a
compound tag:          a_vs_b
standalone tag:        namespace:a
```

## Hierarchy rules

A hierarchy rule lifts a relation directly into tag parents:

```ts
rule.hierarchy({
  members: C.Species,
  parents: C.Super,
  child: tag.namespace('species'),
});
```

If all relation targets are expected to belong to a set, make that invariant explicit:

```ts
rule.hierarchy({
  members: C.Species,
  parents: C.Super,
  child: tag.namespace('species'),
  parentScope: C.Species,
});
```

A scope mismatch is an error. The framework deliberately does not silently discard suspicious parent relations.

Child and parent projections may differ:

```ts
rule.hierarchy({
  members: C.Thing,
  parents: C.Category,
  child: tag.namespace('thing'),
  parent: tag.namespace('category'),
});
```

## N-dimensional Cartesian products

`rule.product()` is not specialized to a historical `modifier × target` model. It accepts any number of axes.

```ts
rule.product({
  axes: [
    { name: 'color', members: C.Color, parents: C.ColorSuper },
    { name: 'material', members: C.Material, parents: C.MaterialSuper },
    { name: 'bodypart', members: C.BodyPart, parents: C.BodySuper, imply: tag.id },
  ],
  render: (parts) => parts.join('_'),
});
```

Each axis can independently define:

- its member set;
- its hierarchy relation;
- an optional validation scope for hierarchy targets;
- whether the composite implies the standalone member and through which projection.

Hierarchy lifting replaces only the affected axis, so a relation such as:

```text
navy -> blue
```

can induce:

```text
navy_fur -> blue_fur
```

while an unrelated target relation:

```text
fur -> body
```

independently induces:

```text
navy_fur -> navy_body
```

`accept(parts, world)` can reject semantically impossible Cartesian tuples.

Distinct tuples rendering to the same Hydrus tag fail with `ProductTagCollisionError` (as the `cause` of `RuleExecutionError` when encountered during compilation).

## Compound domains

A compound domain owns **identity normalization and rendering**, not implication semantics.

### Symmetric / permutation-independent

```ts
const versus = compound.symmetric({
  members: C.Combinable,
  arity: 2,
  orderBy: C.Order,
  render: tag.join('_vs_'),
});
```

With orders `a=1, b=2, c=3`, enumeration is:

```text
a_vs_a
a_vs_b
a_vs_c
b_vs_b
b_vs_c
c_vs_c
```

But `b_vs_a` is not “invalid”; input `['b', 'a']` normalizes to the one canonical identity `['a', 'b']`, which renders as `a_vs_b`.

`orderBy` is only canonicalization. It creates no semantic hierarchy.

You can replace numeric/string ordering with `compareMembers` or `compareValues`.

### Ordered

When slot order is semantic:

```ts
const relationTag = compound.ordered({
  members: C.Actor,
  arity: 2,
  repeats: 'forbid',
  render: ([subject, object]) => `${subject}_to_${object}`,
});
```

`a_to_b` and `b_to_a` are distinct identities.

### Custom equivalence/canonicalization

For less common algebraic structures:

```ts
const custom = compound.custom({
  members: C.Member,
  arity: 3,
  canonicalize(parts, world) {
    return domainSpecificNormalForm(parts, world);
  },
  render(parts, world) {
    return materialize(parts, world);
  },
});
```

An optional custom enumerator can replace the default Cartesian-power enumeration.

All domains support:

- `repeats: 'allow' | 'forbid'`;
- `accept(parts, world)` compatibility filtering;
- optional parsing of pre-existing external tags;
- collision detection (`CompoundTagCollisionError`).

## Compound implication rules

A domain says what a compound *is*. `rule.compound()` says what it *implies*.

Decompose into standalone member representations:

```ts
rule.compound({
  domain: versus,
  decompose: tag.id,
});
```

Slot-aware decomposition:

```ts
rule.compound({
  domain: versus,
  decompose(member, world, { index }) {
    return index === 0
      ? tag.from(C.StandaloneTag, tag.id)(member, world)
      : member;
  },
});
```

This naturally produces:

```text
a_vs_b -> namespace:a
a_vs_b -> b
```

A member can produce zero, one, or several standalone parents by returning `null`, a string, or an iterable of strings.

Lift a semantic relation through every slot:

```ts
rule.compound({
  domain: versus,
  inherit: C.Super,
});
```

Or derive slot-specific relations:

```ts
const leftSupers = relation(C.LeftSuper);
const rightSupers = relation(C.RightSuper);

rule.compound({
  domain: versus,
  inherit(member, world, { index }) {
    return index === 0
      ? leftSupers.targets(member, world)
      : rightSupers.targets(member, world);
  },
});
```

Whole-compound derived parents are independent again:

```ts
rule.compound({
  domain: versus,
  derive(compound, world) {
    return deriveSpecialParents(compound, world);
  },
});
```

## Custom rules and safe fixed-point derivation

Escape hatches are ordinary TypeScript:

```ts
const derived = rule.custom('derive-special-state', ({ world }) => {
  for (const entity of world.entities()) {
    if (someCondition(entity, world)) {
      entity.patch(C.Derived);
    }
  }
});

const materialize = rule.custom('special-parent', ({ world, emit }) => {
  for (const entity of world.entities()) {
    if (entity.has(C.Derived)) {
      emit(`special:${entity.id}`, entity.id, {
        reason: 'derived-state',
        source: entity.id,
      });
    }
  }
});
```

Rules can be passed directly or in arbitrarily nested arrays/Sets; no `rules(...)` wrapper is required:

```ts
compile(world, coreRules, optionalRules, oneMoreRule);
```

### Why the compiler rebuilds the graph after World changes

Rules may replace a component value, not only append monotonic facts. If a rule changes `World`, implications emitted earlier in that pass may no longer be true.

Therefore compilation is deliberately defined as:

1. create a fresh implication graph;
2. run all rules in priority order;
3. if `World` changed, discard that graph and repeat;
4. return the graph only from a pass where `World` stayed unchanged.

This makes the final graph a materialization of the final stabilized world rather than an append-only historical artifact.

For diagnostics/pass counts:

```ts
const result = new Compiler({ maxPasses: 64 }).run(world, rules);
console.log(result.passes, result.graph.size);
```

Non-converging mutations throw `CompilerConvergenceError`. Rule failures are wrapped in `RuleExecutionError` with the rule name, pass number and original `cause`.

## Graph inspection and provenance

```ts
graph.has('navy_fur', 'blue_fur');
graph.parents('navy_fur');
graph.children('blue_fur');
graph.get('navy_fur', 'blue_fur');
```

Every direct edge keeps all distinct provenance records:

```ts
{
  rule: 'product:Color×Colorable',
  reason: 'product-inherit',
  source: 'color: navy -> blue',
}
```

Transitive explanations:

```ts
const proof = graph.why('navy_fur', 'body');
// proof.path
// proof.edges[*].provenance
```

Views:

```ts
graph.edges('direct');
graph.edges('reduced');
graph.edges('closure');
```

Direct `graph.add()` cycles throw `ImplicationCycleError`; when a rule creates one during compilation it is preserved as the `cause` of `RuleExecutionError`.

## Serialization

The default output view is the transitive reduction, which is usually the useful Hydrus parent set:

```ts
serialize.text(graph);
serialize.tsv(graph);
serialize.json(graph);
```

Explicit views:

```ts
serialize.text(graph, { view: 'direct' });
serialize.tsv(graph, { view: 'closure' });
```

## Design break from earlier prototypes

There is no compatibility shim. In particular:

- the package/repository is now named `esm-tagfactory`;
- `marker/component/refs` were replaced by the single coherent `flag/field/links` component vocabulary;
- explicit `define*` constructors and their aliases are gone;
- component names now normally come from `components({ ... })` keys;
- `createWorld`, `define`, `is`, `with`, and specialized refs mutation methods are gone in favor of `world()` + the same callable traits everywhere;
- marker-only selectors are gone; every component can naturally act as a presence set;
- relation wrappers are optional because `links()` components are relation sources themselves;
- `tag` is the only projection/materialization helper surface;
- `product` is N-dimensional and no longer uses modifier/target-specific vocabulary;
- combination-specific historical codec/tag-format aliases are gone;
- compound identity is modeled explicitly as `compound.symmetric/ordered/custom`;
- `rule.compound` owns compound implications instead of a separate combination-system API;
- `Engine`, `System`, `rules(...)`, `generateImplications()` and positional imply overloads are gone;
- the execution model is `Compiler`/`compile` with fresh-graph recomputation after world mutations;
- provenance terminology is now `rule/reason/source` throughout;
- graph inspection uses the shorter `parents/children/get/why/edges` vocabulary;
- export helpers are grouped under `serialize`.

The purpose of the break is to remove duplicate ways to express the same operation and reserve abstraction budget for genuinely different semantics.

## Development

The repository is usable with either npm/Node.js or Bun. The npm lockfile is committed for reproducible Node.js CI; Bun can consume it directly without creating another lockfile.

```sh
npm ci
npm run check:node
```

With Bun:

```sh
bun install --no-save
bun run check:bun
bun run example
```

GitHub Actions runs the library on Node.js 20, 22, 24 and 26, plus Bun 1.4.0. It checks library types, consumer-facing type inference, the production ESM build, Node runtime smoke tests, the Bun test suite, and npm package contents.
