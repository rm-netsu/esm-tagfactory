import {
  isAppendLinksFact,
  isSetFact,
  type EntityId,
  type FlagComponent,
  type ReadableComponent,
  type Trait,
} from './component.js';

export class Entity {
  readonly #values = new Map<symbol, unknown>();
  readonly #changed: () => void;

  constructor(
    readonly id: EntityId,
    changed: () => void,
  ) {
    this.#changed = changed;
  }

  has<T>(component: ReadableComponent<T>): boolean {
    return this.#values.has(component.token);
  }

  get<T>(component: ReadableComponent<T>): T | undefined {
    return this.#values.get(component.token) as T | undefined;
  }

  require<T>(component: ReadableComponent<T>): T {
    const value = this.get(component);
    if (value === undefined) {
      throw new Error(`Entity "${this.id}" is missing required component "${component.name}"`);
    }
    return value;
  }

  set<T>(component: ReadableComponent<T>, value: T): boolean {
    const had = this.#values.has(component.token);
    const previous = this.#values.get(component.token) as T | undefined;
    if (had && component.equals(previous as T, value)) return false;
    this.#values.set(component.token, value);
    this.#changed();
    return true;
  }

  patch(...traits: readonly Trait[]): this {
    for (const trait of traits) {
      if (isSetFact(trait)) {
        this.set(trait.component, trait.value);
        continue;
      }
      if (isAppendLinksFact(trait)) {
        const current = this.get(trait.component) ?? [];
        const next = [...current];
        const seen = new Set(current);
        for (const target of trait.targets) {
          if (seen.has(target)) continue;
          seen.add(target);
          next.push(target);
        }
        this.set(trait.component, next);
        continue;
      }
      this.set(trait as FlagComponent, true);
    }
    return this;
  }
}

export type WorldDefinition = Readonly<Record<EntityId, readonly Trait[]>>;

export class World {
  readonly #entities = new Map<EntityId, Entity>();
  #revision = 0;

  constructor(definition?: WorldDefinition) {
    if (definition) this.addMany(definition);
  }

  get revision(): number { return this.#revision; }
  get size(): number { return this.#entities.size; }

  entity(id: EntityId): Entity {
    let entity = this.#entities.get(id);
    if (entity) return entity;
    entity = new Entity(id, () => { this.#revision++; });
    this.#entities.set(id, entity);
    this.#revision++;
    return entity;
  }

  find(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  require(id: EntityId): Entity {
    const entity = this.find(id);
    if (!entity) throw new Error(`Unknown entity: "${id}"`);
    return entity;
  }

  add(id: EntityId, ...traits: readonly Trait[]): this {
    this.entity(id).patch(...traits);
    return this;
  }

  patch(id: EntityId, ...traits: readonly Trait[]): this {
    return this.add(id, ...traits);
  }

  addMany(definition: WorldDefinition): this {
    for (const [id, traits] of Object.entries(definition)) this.add(id, ...traits);
    return this;
  }

  has<T>(id: EntityId, component: ReadableComponent<T>): boolean {
    return this.find(id)?.has(component) ?? false;
  }

  get<T>(id: EntityId, component: ReadableComponent<T>): T | undefined {
    return this.find(id)?.get(component);
  }

  *entities(): IterableIterator<Entity> {
    yield* this.#entities.values();
  }
}

/** Compact constructor for static or progressively built ontologies. */
export function world(definition?: WorldDefinition): World {
  return new World(definition);
}
