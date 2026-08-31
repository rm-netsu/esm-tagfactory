import type { EntityId, ReadableComponent, Tag } from './component.js'
import { setHas, type EntitySet, type EntityPredicate } from './query.js'
import type { World } from './world.js'

export type TagProjection = (entity: EntityId, world: World) => Tag
export type CompoundRenderer = (parts: readonly EntityId[], world: World) => Tag

const id: TagProjection = (entity) => entity

export const tag = {
	id,

	namespace(namespace: string, separator = ':'): TagProjection {
		return (entity) => `${namespace}${separator}${entity}`
	},

	from(
		component: ReadableComponent<Tag>,
		fallback?: TagProjection,
	): TagProjection {
		return (entity, world) => {
			const value = world.get(entity, component)
			if (value !== undefined) return value
			if (fallback) return fallback(entity, world)
			throw new Error(
				`Entity "${entity}" has no "${component.name}" value required for tag materialization`,
			)
		}
	},

	map(
		base: TagProjection,
		mapper: (value: Tag, entity: EntityId, world: World) => Tag,
	): TagProjection {
		return (entity, world) => mapper(base(entity, world), entity, world)
	},

	when(
		condition: EntitySet | EntityPredicate,
		whenTrue: TagProjection,
		whenFalse: TagProjection = id,
	): TagProjection {
		return (entity, world) => {
			const matches =
				typeof condition === 'function' && !('token' in condition)
					? condition(world.require(entity), world)
					: setHas(world, condition as EntitySet, entity)
			return matches ? whenTrue(entity, world) : whenFalse(entity, world)
		}
	},

	join(separator: string, part: TagProjection = id): CompoundRenderer {
		return (parts, world) =>
			parts.map((entity) => part(entity, world)).join(separator)
	},
} as const
