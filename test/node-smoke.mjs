import assert from 'node:assert/strict'
import {
	compile,
	components,
	compound,
	field,
	flag,
	links,
	rule,
	tag,
	world,
} from '../dist/index.js'

const C = components({
	Color: flag(),
	Colorable: flag(),
	Super: links(),
	BodySuper: links(),
	Combo: flag(),
	Order: field(),
	Standalone: field(),
})

const w = world({
	blue: [C.Color],
	navy: [C.Color, C.Super('blue')],
	hair: [C.Colorable],
	body: [C.Colorable],
	fur: [C.Colorable, C.BodySuper('body')],
	a: [C.Combo, C.Order(1), C.Standalone('namespace:a')],
	b: [C.Combo, C.Order(2)],
	c: [C.Combo, C.Order(3)],
})

const versus = compound.symmetric({
	members: C.Combo,
	orderBy: C.Order,
	render: tag.join('_vs_'),
})
assert.equal(versus.normalize(w, ['c', 'a']).tag, 'a_vs_c')

const standalone = tag.from(C.Standalone, tag.id)
const graph = compile(
	w,
	rule.product({
		axes: [
			{ members: C.Color, parents: C.Super },
			{ members: C.Colorable, parents: C.BodySuper, imply: true },
		],
		render: tag.join('_'),
	}),
	rule.compound({
		domain: versus,
		decompose: (member, currentWorld, { index }) =>
			index === 0 ? standalone(member, currentWorld) : member,
	}),
)

assert.equal(graph.has('navy_fur', 'blue_fur'), true)
assert.equal(graph.has('navy_fur', 'navy_body'), true)
assert.equal(graph.has('a_vs_b', 'namespace:a'), true)
assert.equal(graph.has('a_vs_b', 'b'), true)
console.log('node smoke: ok')
