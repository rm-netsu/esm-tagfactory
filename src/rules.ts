import { isLinksComponent, type EntityId, type Tag } from './component.js';
import { CompoundRejectedError, type Compound, type CompoundDomain } from './compound.js';
import { setEntities, setHas, setName, type EntitySet } from './query.js';
import { Relation, relationName, relationTargets, type RelationLike } from './relation.js';
import { customRule, type Rule, type RuleContext } from './rule-core.js';
import { tag, type CompoundRenderer, type TagProjection } from './tag.js';
import type { World } from './world.js';

export interface HierarchyRuleOptions {
  readonly name?: string;
  readonly members: EntitySet;
  readonly parents: RelationLike;
  readonly child?: TagProjection;
  readonly parent?: TagProjection;
  /** Optional validation scope. A parent outside it is an error, never silently dropped. */
  readonly parentScope?: EntitySet;
  readonly priority?: number;
}

function hierarchy(options: HierarchyRuleOptions): Rule {
  const childTag = options.child ?? tag.id;
  const parentTag = options.parent ?? childTag;
  const name = options.name ?? `hierarchy:${setName(options.members)}:${relationName(options.parents)}`;
  return customRule(name, ({ world, emit }) => {
    for (const entity of setEntities(world, options.members)) {
      for (const parent of relationTargets(options.parents, entity.id, world)) {
        if (options.parentScope && !setHas(world, options.parentScope, parent)) {
          throw new Error(`Parent "${parent}" of "${entity.id}" is outside required scope "${setName(options.parentScope)}"`);
        }
        emit(childTag(entity.id, world), parentTag(parent, world), {
          reason: 'hierarchy',
          source: `${entity.id} -> ${parent}`,
        });
      }
    }
  }, options.priority === undefined ? {} : { priority: options.priority });
}

export interface ProductAxis {
  readonly name?: string;
  readonly members: EntitySet;
  /** Relation used to lift hierarchy through this axis. */
  readonly parents?: RelationLike;
  /** Optional validation scope for relation targets. */
  readonly parentScope?: EntitySet;
  /** Emit product -> standalone member. `true` means tag.id. */
  readonly imply?: true | TagProjection;
}

export interface ProductRuleOptions {
  readonly name?: string;
  readonly axes: readonly ProductAxis[];
  readonly render: CompoundRenderer;
  readonly accept?: (parts: readonly EntityId[], world: World) => boolean;
  readonly detectTagCollisions?: boolean;
  readonly priority?: number;
}

export class ProductTagCollisionError extends Error {
  constructor(
    readonly ruleName: string,
    readonly tag: Tag,
    readonly first: readonly EntityId[],
    readonly second: readonly EntityId[],
  ) {
    super(`Product rule "${ruleName}" maps both [${first.join(', ')}] and [${second.join(', ')}] to "${tag}"`);
    this.name = 'ProductTagCollisionError';
  }
}

function* productTuples(world: World, axes: readonly ProductAxis[]): IterableIterator<readonly EntityId[]> {
  const values = axes.map((axis) => [...setEntities(world, axis.members)].map((entity) => entity.id));
  const tuple = new Array<EntityId>(axes.length);
  function* visit(index: number): IterableIterator<readonly EntityId[]> {
    if (index === values.length) {
      yield [...tuple];
      return;
    }
    for (const value of values[index] ?? []) {
      tuple[index] = value;
      yield* visit(index + 1);
    }
  }
  yield* visit(0);
}

function tupleKey(parts: readonly EntityId[]): string {
  return JSON.stringify(parts);
}

function product(options: ProductRuleOptions): Rule {
  if (options.axes.length === 0) throw new Error('Product rule requires at least one axis');
  const name = options.name ?? `product:${options.axes.map((axis) => axis.name ?? setName(axis.members)).join('×')}`;
  return customRule(name, ({ world, emit }) => {
    const seenTags = new Map<Tag, readonly EntityId[]>();
    const materialize = (parts: readonly EntityId[]): Tag => {
      const result = options.render(parts, world);
      if (options.detectTagCollisions ?? true) {
        const previous = seenTags.get(result);
        if (previous && tupleKey(previous) !== tupleKey(parts)) {
          throw new ProductTagCollisionError(name, result, previous, parts);
        }
        if (!previous) seenTags.set(result, [...parts]);
      }
      return result;
    };

    for (const parts of productTuples(world, options.axes)) {
      if (options.accept && !options.accept(parts, world)) continue;
      const child = materialize(parts);

      const standaloneParents = new Set<Tag>();
      for (let index = 0; index < options.axes.length; index++) {
        const axis = options.axes[index]!;
        const member = parts[index]!;
        if (axis.imply) {
          const projection = axis.imply === true ? tag.id : axis.imply;
          standaloneParents.add(projection(member, world));
        }
      }
      for (const parent of standaloneParents) {
        if (parent !== child) emit(child, parent, { reason: 'product-member' });
      }

      for (let index = 0; index < options.axes.length; index++) {
        const axis = options.axes[index]!;
        if (!axis.parents) continue;
        const member = parts[index]!;
        for (const parent of relationTargets(axis.parents, member, world)) {
          if (axis.parentScope && !setHas(world, axis.parentScope, parent)) {
            throw new Error(
              `Product axis "${axis.name ?? index}" parent "${parent}" is outside scope "${setName(axis.parentScope)}"`,
            );
          }
          const lifted = [...parts];
          lifted[index] = parent;
          if (options.accept && !options.accept(lifted, world)) continue;
          const parentTag = materialize(lifted);
          if (parentTag === child) continue;
          emit(child, parentTag, {
            reason: 'product-inherit',
            source: `${axis.name ?? index}: ${member} -> ${parent}`,
          });
        }
      }
    }
  }, options.priority === undefined ? {} : { priority: options.priority });
}

export interface CompoundMemberContext {
  readonly index: number;
  readonly compound: Compound;
  readonly domain: CompoundDomain;
}

export type MemberProjection = (
  member: EntityId,
  world: World,
  context: CompoundMemberContext,
) => Tag | Iterable<Tag> | null | undefined;

export type MemberRelationResolver = (
  member: EntityId,
  world: World,
  context: CompoundMemberContext,
) => Iterable<EntityId>;

export interface CompoundRuleOptions {
  readonly name?: string;
  readonly domain: CompoundDomain;
  /** Optional decomposition: compound -> one or more standalone tags for each member. */
  readonly decompose?: MemberProjection;
  /** Lift member hierarchy through the compound. */
  readonly inherit?: RelationLike | MemberRelationResolver;
  /** Additional derived parent tags for a whole compound. */
  readonly derive?: (compound: Compound, world: World) => Iterable<Tag>;
  readonly priority?: number;
}

function normalizeTags(value: Tag | Iterable<Tag> | null | undefined): readonly Tag[] {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  return [...value];
}

function resolveMemberParents(
  source: RelationLike | MemberRelationResolver,
  member: EntityId,
  world: World,
  context: CompoundMemberContext,
): Iterable<EntityId> {
  if (source instanceof Relation || isLinksComponent(source)) {
    return relationTargets(source, member, world);
  }
  return source(member, world, context);
}

function compoundRule(options: CompoundRuleOptions): Rule {
  const name = options.name ?? `compound:${options.domain.name}`;
  return customRule(name, ({ world, emit }) => {
    for (const current of options.domain.compounds(world)) {
      if (options.decompose) {
        const emitted = new Set<Tag>();
        for (let index = 0; index < current.parts.length; index++) {
          const member = current.parts[index]!;
          const context = { index, compound: current, domain: options.domain } as const;
          for (const parent of normalizeTags(options.decompose(member, world, context))) {
            if (emitted.has(parent) || parent === current.tag) continue;
            emitted.add(parent);
            emit(current.tag, parent, {
              reason: 'compound-member',
              source: `${current.tag}[${index}] = ${member}`,
            });
          }
        }
      }

      if (options.derive) {
        for (const parent of new Set(options.derive(current, world))) {
          if (parent !== current.tag) emit(current.tag, parent, { reason: 'compound-derived' });
        }
      }

      if (options.inherit) {
        for (let index = 0; index < current.parts.length; index++) {
          const member = current.parts[index]!;
          const context = { index, compound: current, domain: options.domain } as const;
          for (const parent of resolveMemberParents(options.inherit, member, world, context)) {
            if (!options.domain.has(world, parent)) {
              throw new Error(
                `Compound inheritance ${member} -> ${parent} leaves domain "${options.domain.name}"; ` +
                'expand the domain membership query or filter the inheritance relation',
              );
            }
            const lifted = [...current.parts];
            lifted[index] = parent;
            let parentCompound: Compound;
            try {
              parentCompound = options.domain.normalize(world, lifted);
            } catch (error) {
              // A domain compatibility predicate may intentionally make a lifted form invalid.
              if (error instanceof CompoundRejectedError) continue;
              throw error;
            }
            if (parentCompound.tag === current.tag) continue;
            emit(current.tag, parentCompound.tag, {
              reason: 'compound-inherit',
              source: `${member} -> ${parent}`,
            });
          }
        }
      }
    }
  }, options.priority === undefined ? {} : { priority: options.priority });
}

export const rule = {
  custom: customRule,
  hierarchy,
  product,
  compound: compoundRule,
} as const;
