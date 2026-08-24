import type { EntityId, ReadableComponent, Tag } from './component.js';
import { setEntities, setHas, setName, type EntitySet } from './query.js';
import type { CompoundRenderer } from './tag.js';
import type { World } from './world.js';

export interface Compound {
  readonly parts: readonly EntityId[];
  readonly tag: Tag;
}

export type CompoundParser = (tag: Tag, world: World) => readonly EntityId[];
export type CompoundCanonicalizer = (parts: readonly EntityId[], world: World) => readonly EntityId[];
export type CompoundEnumerator = (world: World, domain: CompoundDomain) => Iterable<readonly EntityId[]>;
export type MemberComparator = (left: EntityId, right: EntityId, world: World) => number;

interface BaseDomainOptions {
  readonly name?: string;
  readonly members: EntitySet;
  readonly arity?: number;
  readonly repeats?: 'allow' | 'forbid';
  readonly render: CompoundRenderer;
  readonly parse?: CompoundParser;
  readonly accept?: (parts: readonly EntityId[], world: World) => boolean;
  readonly detectTagCollisions?: boolean;
}

export interface SymmetricDomainOptions<T = never> extends BaseDomainOptions {
  readonly orderBy?: ReadableComponent<T>;
  readonly compareValues?: (left: T, right: T) => number;
  readonly compareMembers?: MemberComparator;
}

export interface OrderedDomainOptions extends BaseDomainOptions {}

export interface CustomDomainOptions extends BaseDomainOptions {
  readonly canonicalize: CompoundCanonicalizer;
  readonly enumerate?: CompoundEnumerator;
}

export class CompoundRejectedError extends Error {
  constructor(
    readonly domain: string,
    readonly parts: readonly EntityId[],
  ) {
    super(`Compound [${parts.join(', ')}] is not accepted by domain "${domain}"`);
    this.name = 'CompoundRejectedError';
  }
}

export class CompoundTagCollisionError extends Error {
  constructor(
    readonly domain: string,
    readonly tag: Tag,
    readonly first: readonly EntityId[],
    readonly second: readonly EntityId[],
  ) {
    super(
      `Compound domain "${domain}" maps two distinct canonical compounds to "${tag}": ` +
      `[${first.join(', ')}] and [${second.join(', ')}]`,
    );
    this.name = 'CompoundTagCollisionError';
  }
}

function defaultCompare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
  throw new Error('orderBy values require compareValues unless they are numbers or strings');
}

function tupleKey(parts: readonly EntityId[]): string {
  return JSON.stringify(parts);
}

export class CompoundDomain {
  readonly name: string;
  readonly members: EntitySet;
  readonly arity: number;
  readonly repeats: 'allow' | 'forbid';
  readonly renderTag: CompoundRenderer;
  readonly parseTag: CompoundParser | undefined;
  readonly #canonicalize: CompoundCanonicalizer;
  readonly #enumerate: CompoundEnumerator;
  readonly #accept: ((parts: readonly EntityId[], world: World) => boolean) | undefined;
  readonly #detectCollisions: boolean;
  readonly #collisionState = new WeakMap<World, { revision: number; tags: Map<Tag, readonly EntityId[]> }>();

  constructor(
    options: BaseDomainOptions,
    canonicalize: CompoundCanonicalizer,
    enumerate: CompoundEnumerator,
  ) {
    this.name = options.name ?? setName(options.members);
    this.members = options.members;
    this.arity = options.arity ?? 2;
    this.repeats = options.repeats ?? 'allow';
    this.renderTag = options.render;
    this.parseTag = options.parse;
    this.#canonicalize = canonicalize;
    this.#enumerate = enumerate;
    this.#accept = options.accept;
    this.#detectCollisions = options.detectTagCollisions ?? true;

    if (!Number.isSafeInteger(this.arity) || this.arity < 1) {
      throw new Error(`Compound domain "${this.name}" requires a positive safe-integer arity`);
    }
  }

  has(world: World, entity: EntityId): boolean {
    return setHas(world, this.members, entity);
  }

  memberIds(world: World): readonly EntityId[] {
    return [...setEntities(world, this.members)].map((entity) => entity.id);
  }

  canonicalParts(world: World, parts: readonly EntityId[]): readonly EntityId[] {
    if (parts.length !== this.arity) {
      throw new Error(`Compound domain "${this.name}" expects ${this.arity} parts, got ${parts.length}`);
    }
    for (const part of parts) {
      if (!this.has(world, part)) {
        throw new Error(`Entity "${part}" is not a member of compound domain "${this.name}"`);
      }
    }

    const canonical = [...this.#canonicalize(parts, world)];
    if (canonical.length !== this.arity) {
      throw new Error(`Compound domain "${this.name}" canonicalizer changed arity`);
    }
    for (const part of canonical) {
      if (!this.has(world, part)) {
        throw new Error(`Compound domain "${this.name}" canonicalizer returned non-member "${part}"`);
      }
    }
    if (this.repeats === 'forbid' && new Set(canonical).size !== canonical.length) {
      throw new Error(`Compound domain "${this.name}" does not allow repeated members`);
    }
    if (this.#accept && !this.#accept(canonical, world)) {
      throw new CompoundRejectedError(this.name, canonical);
    }
    return canonical;
  }

  render(parts: readonly EntityId[], world: World): Tag {
    return this.renderTag(parts, world);
  }

  normalize(world: World, parts: readonly EntityId[]): Compound {
    const canonical = this.canonicalParts(world, parts);
    const tag = this.render(canonical, world);
    this.#recordCollision(world, canonical, tag);
    return { parts: canonical, tag };
  }

  normalizeTag(world: World, value: Tag): Compound {
    if (!this.parseTag) {
      throw new Error(`Compound domain "${this.name}" has no parser for existing external tags`);
    }
    return this.normalize(world, this.parseTag(value, world));
  }

  *compounds(world: World): IterableIterator<Compound> {
    const seen = new Set<string>();
    for (const parts of this.#enumerate(world, this)) {
      const canonical = this.canonicalParts(world, parts);
      const key = tupleKey(canonical);
      if (seen.has(key)) continue;
      seen.add(key);
      yield this.normalize(world, canonical);
    }
  }

  #recordCollision(world: World, parts: readonly EntityId[], tag: Tag): void {
    if (!this.#detectCollisions) return;
    let state = this.#collisionState.get(world);
    if (!state || state.revision !== world.revision) {
      state = { revision: world.revision, tags: new Map() };
      this.#collisionState.set(world, state);
    }
    const previous = state.tags.get(tag);
    if (previous && tupleKey(previous) !== tupleKey(parts)) {
      throw new CompoundTagCollisionError(this.name, tag, previous, parts);
    }
    if (!previous) state.tags.set(tag, [...parts]);
  }
}

function* cartesianPower(values: readonly EntityId[], arity: number): IterableIterator<readonly EntityId[]> {
  if (arity === 0) {
    yield [];
    return;
  }
  const tuple = new Array<EntityId>(arity);
  function* visit(index: number): IterableIterator<readonly EntityId[]> {
    if (index === arity) {
      yield [...tuple];
      return;
    }
    for (const value of values) {
      tuple[index] = value;
      yield* visit(index + 1);
    }
  }
  yield* visit(0);
}

function symmetricEnumerator(compare: MemberComparator): CompoundEnumerator {
  return function* (world, domain) {
    const members = [...domain.memberIds(world)].sort((a, b) => compare(a, b, world));
    const tuple = new Array<EntityId>(domain.arity);
    function* visit(index: number, minimum: number): IterableIterator<readonly EntityId[]> {
      if (index === domain.arity) {
        yield [...tuple];
        return;
      }
      for (let i = minimum; i < members.length; i++) {
        tuple[index] = members[i]!;
        yield* visit(index + 1, domain.repeats === 'allow' ? i : i + 1);
      }
    }
    yield* visit(0, 0);
  };
}

const orderedEnumerator: CompoundEnumerator = function* (world, domain) {
  const members = domain.memberIds(world);
  for (const tuple of cartesianPower(members, domain.arity)) {
    if (domain.repeats === 'forbid' && new Set(tuple).size !== tuple.length) continue;
    yield tuple;
  }
};

export const compound = {
  symmetric<T = never>(options: SymmetricDomainOptions<T>): CompoundDomain {
    const compare: MemberComparator = options.compareMembers ?? ((left, right, world) => {
      if (!options.orderBy) return left.localeCompare(right);
      const leftValue = world.require(left).require(options.orderBy);
      const rightValue = world.require(right).require(options.orderBy);
      const compareValues = options.compareValues ?? (defaultCompare as (left: T, right: T) => number);
      return compareValues(leftValue, rightValue) || left.localeCompare(right);
    });
    const canonicalize: CompoundCanonicalizer = (parts, world) =>
      [...parts].sort((left, right) => compare(left, right, world));
    return new CompoundDomain(options, canonicalize, symmetricEnumerator(compare));
  },

  ordered(options: OrderedDomainOptions): CompoundDomain {
    return new CompoundDomain(options, (parts) => [...parts], orderedEnumerator);
  },

  custom(options: CustomDomainOptions): CompoundDomain {
    return new CompoundDomain(
      options,
      options.canonicalize,
      options.enumerate ?? orderedEnumerator,
    );
  },
} as const;
