export type EntityId = string
export type Tag = string

export interface ComponentOptions<T> {
	readonly equals?: (left: T, right: T) => boolean
}

const SET = Symbol('set-fact')
const APPEND = Symbol('append-links')
const BIND_NAME = Symbol('bind-name')

export interface ReadableComponent<T> {
	readonly token: symbol
	readonly name: string
	readonly kind: 'flag' | 'field' | 'links'
	equals(left: T, right: T): boolean
	readonly [BIND_NAME]: (name: string) => void
}

export interface FlagComponent extends ReadableComponent<true> {
	readonly kind: 'flag'
}

export interface SetFact<T> {
	readonly kind: typeof SET
	readonly component: ReadableComponent<T>
	readonly value: T
}

export interface AppendLinksFact {
	readonly kind: typeof APPEND
	readonly component: LinksComponent
	readonly targets: readonly EntityId[]
}

export interface FieldComponent<T> extends ReadableComponent<T> {
	readonly kind: 'field'
	(value: T): SetFact<T>
}

export interface LinksComponent extends ReadableComponent<readonly EntityId[]> {
	readonly kind: 'links'
	(...targets: readonly EntityId[]): AppendLinksFact
	replace(...targets: readonly EntityId[]): SetFact<readonly EntityId[]>
}

export type AnyComponent = FlagComponent | FieldComponent<any> | LinksComponent
export type Trait = FlagComponent | SetFact<any> | AppendLinksFact
export type ComponentSet = Readonly<Record<string, AnyComponent>>

function metadata<T>(
	kind: ReadableComponent<T>['kind'],
	options: ComponentOptions<T>,
) {
	let name = ''
	return {
		token: Symbol(kind),
		kind,
		get name() {
			return name || '<unbound>'
		},
		equals(left: T, right: T) {
			return options.equals?.(left, right) ?? Object.is(left, right)
		},
		[BIND_NAME](next: string) {
			if (name && name !== next) {
				throw new Error(
					`Component is already bound as "${name}" and cannot also be named "${next}"`,
				)
			}
			name = next
		},
	} as const
}

function decorateCallable<T, F extends Function>(
	fn: F,
	meta: ReturnType<typeof metadata<T>>,
): F & ReadableComponent<T> {
	Object.defineProperties(fn, {
		token: { value: meta.token, enumerable: true },
		kind: { value: meta.kind, enumerable: true },
		name: { get: () => meta.name, configurable: true },
		equals: { value: meta.equals.bind(meta), enumerable: true },
		[BIND_NAME]: { value: meta[BIND_NAME].bind(meta) },
	})
	return fn as F & ReadableComponent<T>
}

/** Marker fact. Use it directly in world definitions: `[C.Color]`. */
export function flag(): FlagComponent {
	return metadata('flag', {}) as FlagComponent
}

/** Typed scalar/object fact. The returned component is callable: `C.Order(10)`. */
export function field<T>(options: ComponentOptions<T> = {}): FieldComponent<T> {
	let component!: FieldComponent<T>
	const fn = ((value: T): SetFact<T> => ({
		kind: SET,
		component,
		value,
	})) as FieldComponent<T>
	component = decorateCallable<T, typeof fn>(
		fn,
		metadata('field', options),
	) as FieldComponent<T>
	return component
}

/**
 * Multi-reference fact. Calling appends unique links; `.replace()` replaces the whole list.
 * A LinksComponent can also be passed directly anywhere a relation is accepted.
 */
export function links(): LinksComponent {
	let component!: LinksComponent
	const fn = ((...targets: readonly EntityId[]): AppendLinksFact => ({
		kind: APPEND,
		component,
		targets,
	})) as LinksComponent
	component = decorateCallable<readonly EntityId[], typeof fn>(
		fn,
		metadata('links', {
			equals(left: readonly EntityId[], right: readonly EntityId[]) {
				return (
					left === right ||
					(left.length === right.length &&
						left.every((value, index) => value === right[index]))
				)
			},
		}),
	) as LinksComponent
	component.replace = (...targets) => ({
		kind: SET,
		component,
		value: [...targets],
	})
	return component
}

/**
 * Binds runtime names from TypeScript object keys while preserving the exact inferred component map.
 * This is intentionally native TypeScript data, not a string ontology DSL.
 */
export function components<const T extends ComponentSet>(definition: T): T {
	for (const [name, component] of Object.entries(definition)) {
		component[BIND_NAME](name)
	}
	return definition
}

export function isSetFact(value: Trait): value is SetFact<any> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'kind' in value &&
		value.kind === SET
	)
}

export function isAppendLinksFact(value: Trait): value is AppendLinksFact {
	return (
		typeof value === 'object' &&
		value !== null &&
		'kind' in value &&
		value.kind === APPEND
	)
}

export function isComponent(value: unknown): value is AnyComponent {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		'token' in value &&
		'kind' in value
	)
}

export function isLinksComponent(value: unknown): value is LinksComponent {
	return isComponent(value) && value.kind === 'links'
}
