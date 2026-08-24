import { isLinksComponent, type EntityId, type LinksComponent } from './component.js';
import type { World } from './world.js';

export type RelationResolver = (source: EntityId, world: World) => Iterable<EntityId>;
export type RelationLike = LinksComponent | Relation;
export type RelationPredicate = (source: EntityId, target: EntityId, world: World) => boolean;

export class Relation {
  constructor(
    readonly name: string,
    readonly resolve: RelationResolver,
  ) {}

  targets(source: EntityId, world: World): readonly EntityId[] {
    return [...new Set(this.resolve(source, world))];
  }

  or(...others: readonly RelationLike[]): Relation {
    const base = this;
    return new Relation(`${this.name}|${others.map(relationName).join('|')}`, function* (source: EntityId, world: World) {
      const seen = new Set<EntityId>();
      for (const current of [base, ...others]) {
        for (const target of relationTargets(current, source, world)) {
          if (seen.has(target)) continue;
          seen.add(target);
          yield target;
        }
      }
    });
  }

  filter(predicate: RelationPredicate, name = 'filter'): Relation {
    const base = this;
    return new Relation(`${this.name}:${name}`, function* (source: EntityId, world: World) {
      for (const target of base.targets(source, world)) {
        if (predicate(source, target, world)) yield target;
      }
    });
  }

  inverse(name = `${this.name}^-1`): Relation {
    return new Relation(name, (target, world) => {
      const out: EntityId[] = [];
      for (const entity of world.entities()) {
        if (this.targets(entity.id, world).includes(target)) out.push(entity.id);
      }
      return out;
    });
  }

  transitive(name = `${this.name}+`): Relation {
    return new Relation(name, (source, world) => {
      const out: EntityId[] = [];
      const queue = [...this.targets(source, world)];
      const seen = new Set<EntityId>();
      for (let i = 0; i < queue.length; i++) {
        const target = queue[i]!;
        if (seen.has(target)) continue;
        seen.add(target);
        out.push(target);
        queue.push(...this.targets(target, world));
      }
      return out;
    });
  }
}

export function relation(source: LinksComponent): Relation;
export function relation(name: string, resolver: RelationResolver): Relation;
export function relation(sourceOrName: LinksComponent | string, resolver?: RelationResolver): Relation {
  if (isLinksComponent(sourceOrName)) {
    const source = sourceOrName;
    return new Relation(source.name, (entity, world) => world.get(entity, source) ?? []);
  }
  if (!resolver) throw new Error(`Computed relation "${sourceOrName}" requires a resolver`);
  return new Relation(sourceOrName, resolver);
}

export function relationName(source: RelationLike): string {
  return source.name;
}

export function relationTargets(source: RelationLike, entity: EntityId, world: World): readonly EntityId[] {
  return source instanceof Relation ? source.targets(entity, world) : world.get(entity, source) ?? [];
}
