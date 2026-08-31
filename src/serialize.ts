import type { GraphView, ImplicationGraph } from './graph.js'

export interface SerializeOptions {
	readonly view?: GraphView
}

export const serialize = {
	text(
		graph: ImplicationGraph,
		options: SerializeOptions & { readonly arrow?: string } = {},
	): string {
		const arrow = options.arrow ?? ' -> '
		return graph
			.edges(options.view ?? 'reduced')
			.map(({ child, parent }) => `${child}${arrow}${parent}`)
			.join('\n')
	},

	tsv(graph: ImplicationGraph, options: SerializeOptions = {}): string {
		return graph
			.edges(options.view ?? 'reduced')
			.map(({ child, parent }) => `${child}\t${parent}`)
			.join('\n')
	},

	json(graph: ImplicationGraph, options: SerializeOptions = {}): string {
		return JSON.stringify(graph.edges(options.view ?? 'reduced'), null, 2)
	},
} as const
