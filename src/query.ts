import type { AnyComponent, EntityId } from './component.js'
import type { Entity, World } from './world.js'

export type EntityPredicate = (entity: Entity, world: World) => boolean
export type EntitySet = AnyComponent | Query

function test(set: EntitySet, entity: Entity, world: World): boolean {
	return set instanceof Query ? set.test(entity, world) : entity.has(set)
}

export function setName(set: EntitySet): string {
	return set instanceof Query ? set.name : set.name
}

export class Query {
	constructor(
		readonly name: string,
		readonly predicate: EntityPredicate,
	) {}

	test(entity: Entity, world: World): boolean {
		return this.predicate(entity, world)
	}

	has(world: World, id: EntityId): boolean {
		const entity = world.find(id)
		return entity ? this.test(entity, world) : false
	}

	*entities(world: World): IterableIterator<Entity> {
		for (const entity of world.entities())
			if (this.test(entity, world)) yield entity
	}

	ids(world: World): readonly EntityId[] {
		return [...this.entities(world)].map((entity) => entity.id)
	}

	and(...sets: readonly EntitySet[]): Query {
		const suffix = sets.map(setName).join('&')
		return new Query(
			suffix ? `${this.name}&${suffix}` : this.name,
			(entity, world) =>
				this.test(entity, world) &&
				sets.every((set) => test(set, entity, world)),
		)
	}

	or(...sets: readonly EntitySet[]): Query {
		const suffix = sets.map(setName).join('|')
		return new Query(
			suffix ? `${this.name}|${suffix}` : this.name,
			(entity, world) =>
				this.test(entity, world) ||
				sets.some((set) => test(set, entity, world)),
		)
	}

	without(...sets: readonly EntitySet[]): Query {
		const suffix = sets.map((set) => `!${setName(set)}`).join('&')
		return new Query(
			suffix ? `${this.name}&${suffix}` : this.name,
			(entity, world) =>
				this.test(entity, world) &&
				sets.every((set) => !test(set, entity, world)),
		)
	}

	where(predicate: EntityPredicate, name = 'predicate'): Query {
		return new Query(
			`${this.name}&${name}`,
			(entity, world) =>
				this.test(entity, world) && predicate(entity, world),
		)
	}

	named(name: string): Query {
		return new Query(name, this.predicate)
	}
}

/** Presence-query over components/sets. `query()` with no args selects every entity. */
export function query(...sets: readonly EntitySet[]): Query {
	const name = sets.length ? sets.map(setName).join('&') : '*'
	return new Query(name, (entity, currentWorld) =>
		sets.every((set) => test(set, entity, currentWorld)),
	)
}

export function setHas(world: World, set: EntitySet, id: EntityId): boolean {
	const entity = world.find(id)
	return entity ? test(set, entity, world) : false
}

export function setEntities(world: World, set: EntitySet): Iterable<Entity> {
	if (set instanceof Query) return set.entities(world)
	return query(set).entities(world)
}
