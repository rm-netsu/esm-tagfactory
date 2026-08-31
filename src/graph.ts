import type { Tag } from './component.js'

export interface Provenance {
	readonly rule: string
	readonly reason?: string
	readonly source?: string
}

export interface ImplicationEdge {
	readonly child: Tag
	readonly parent: Tag
	readonly provenance: readonly Provenance[]
}

export interface Explanation {
	readonly path: readonly Tag[]
	readonly edges: readonly ImplicationEdge[]
}

interface MutableEdge {
	readonly child: Tag
	readonly parent: Tag
	readonly provenance: Provenance[]
	readonly keys: Set<string>
}

export type GraphView = 'direct' | 'reduced' | 'closure'

export class ImplicationCycleError extends Error {
	constructor(readonly cycle: readonly Tag[]) {
		super(`Implication would create a cycle: ${cycle.join(' -> ')}`)
		this.name = 'ImplicationCycleError'
	}
}

function provenanceKey(value: Provenance): string {
	return `${value.rule}\0${value.reason ?? ''}\0${value.source ?? ''}`
}

export class ImplicationGraph {
	readonly #parents = new Map<Tag, Map<Tag, MutableEdge>>()
	#size = 0

	get size(): number {
		return this.#size
	}

	has(child: Tag, parent: Tag): boolean {
		return this.#parents.get(child)?.has(parent) ?? false
	}

	parents(child: Tag): readonly Tag[] {
		return [...(this.#parents.get(child)?.keys() ?? [])]
	}

	children(parent: Tag): readonly Tag[] {
		const out: Tag[] = []
		for (const [child, parents] of this.#parents)
			if (parents.has(parent)) out.push(child)
		return out
	}

	get(child: Tag, parent: Tag): ImplicationEdge | undefined {
		const edge = this.#parents.get(child)?.get(parent)
		if (!edge) return undefined
		return { child, parent, provenance: [...edge.provenance] }
	}

	add(
		child: Tag,
		parent: Tag,
		provenance: Provenance = { rule: 'manual' },
	): boolean {
		if (!child || !parent)
			throw new Error('Implication tags must not be empty')
		if (child === parent) throw new ImplicationCycleError([child, child])

		const existing = this.#parents.get(child)?.get(parent)
		if (existing) {
			const key = provenanceKey(provenance)
			if (!existing.keys.has(key)) {
				existing.keys.add(key)
				existing.provenance.push(provenance)
			}
			return false
		}

		const cyclePath = this.path(parent, child)
		if (cyclePath) throw new ImplicationCycleError([child, ...cyclePath])

		let parents = this.#parents.get(child)
		if (!parents) {
			parents = new Map()
			this.#parents.set(child, parents)
		}
		parents.set(parent, {
			child,
			parent,
			provenance: [provenance],
			keys: new Set([provenanceKey(provenance)]),
		})
		this.#size++
		return true
	}

	addAll(
		edges: Iterable<{ child: Tag; parent: Tag; provenance?: Provenance }>,
	): number {
		let added = 0
		for (const edge of edges) {
			if (
				this.add(
					edge.child,
					edge.parent,
					edge.provenance ?? { rule: 'manual' },
				)
			)
				added++
		}
		return added
	}

	path(from: Tag, to: Tag): readonly Tag[] | undefined {
		if (from === to) return [from]
		const queue: Array<{ tag: Tag; path: Tag[] }> = [
			{ tag: from, path: [from] },
		]
		const seen = new Set<Tag>([from])
		for (let cursor = 0; cursor < queue.length; cursor++) {
			const current = queue[cursor]!
			for (const parent of this.parents(current.tag)) {
				if (seen.has(parent)) continue
				const path = [...current.path, parent]
				if (parent === to) return path
				seen.add(parent)
				queue.push({ tag: parent, path })
			}
		}
		return undefined
	}

	why(child: Tag, parent: Tag): Explanation | undefined {
		const path = this.path(child, parent)
		if (!path) return undefined
		const edges: ImplicationEdge[] = []
		for (let index = 0; index + 1 < path.length; index++) {
			const edge = this.get(path[index]!, path[index + 1]!)
			if (!edge)
				throw new Error(
					'ImplicationGraph internal error: missing proof edge',
				)
			edges.push(edge)
		}
		return { path, edges }
	}

	direct(): readonly ImplicationEdge[] {
		const out: ImplicationEdge[] = []
		for (const parents of this.#parents.values()) {
			for (const edge of parents.values()) {
				out.push({
					child: edge.child,
					parent: edge.parent,
					provenance: [...edge.provenance],
				})
			}
		}
		return out.sort(
			(a, b) =>
				a.child.localeCompare(b.child) ||
				a.parent.localeCompare(b.parent),
		)
	}

	closure(): readonly ImplicationEdge[] {
		const nodes = new Set<Tag>()
		for (const edge of this.direct()) {
			nodes.add(edge.child)
			nodes.add(edge.parent)
		}
		const out: ImplicationEdge[] = []
		for (const child of nodes) {
			const queue = [...this.parents(child)]
			const seen = new Set<Tag>()
			for (let i = 0; i < queue.length; i++) {
				const parent = queue[i]!
				if (seen.has(parent)) continue
				seen.add(parent)
				out.push({ child, parent, provenance: [] })
				queue.push(...this.parents(parent))
			}
		}
		return out.sort(
			(a, b) =>
				a.child.localeCompare(b.child) ||
				a.parent.localeCompare(b.parent),
		)
	}

	reduced(): readonly ImplicationEdge[] {
		return this.direct().filter((edge) => {
			return !this.parents(edge.child).some((other) => {
				if (other === edge.parent) return false
				return this.path(other, edge.parent) !== undefined
			})
		})
	}

	edges(view: GraphView = 'direct'): readonly ImplicationEdge[] {
		if (view === 'reduced') return this.reduced()
		if (view === 'closure') return this.closure()
		return this.direct()
	}
}
