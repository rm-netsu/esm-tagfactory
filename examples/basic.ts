import {
	compile,
	components,
	compound,
	field,
	flag,
	links,
	rule,
	serialize,
	tag,
	world,
} from '../src/index.js'

const C = components({
	Color: flag(),
	Colorable: flag(),
	Species: flag(),
	Combinable: flag(),

	Super: links(),
	BodySuper: links(),
	Order: field<number>(),
	StandaloneTag: field<string>(),
	Fragment: field<string>(),
})

const ontology = world({
	blue: [C.Color],
	navy: [C.Color, C.Super('blue')],

	hair: [C.Colorable],
	body: [C.Colorable],
	fur: [C.Colorable, C.BodySuper('body')],

	dragon: [C.Species, C.Super('mythological_scalie')],
	mythological_scalie: [
		C.Species,
		C.Super('mythological_creature', 'scalie'),
	],
	mythological_creature: [C.Species],
	scalie: [C.Species],

	a: [
		C.Combinable,
		C.Order(1),
		C.StandaloneTag('namespace:a'),
		C.Fragment('a'),
	],
	b: [C.Combinable, C.Order(2), C.Fragment('b')],
	c: [C.Combinable, C.Order(3), C.Fragment('c')],
})

const versus = compound.symmetric({
	members: C.Combinable,
	orderBy: C.Order,
	render: tag.join('_vs_', tag.from(C.Fragment, tag.id)),
})

const standalone = tag.from(C.StandaloneTag, tag.id)

const graph = compile(
	ontology,

	rule.product({
		name: 'colored-things',
		axes: [
			{ name: 'color', members: C.Color, parents: C.Super },
			{
				name: 'thing',
				members: C.Colorable,
				parents: C.BodySuper,
				imply: tag.id,
			},
		],
		render: tag.join('_'),
	}),

	rule.hierarchy({
		members: C.Species,
		parents: C.Super,
		child: tag.namespace('species'),
		parentScope: C.Species,
	}),

	rule.compound({
		domain: versus,
		decompose: (member, currentWorld, { index }) =>
			index === 0 ? standalone(member, currentWorld) : member,
	}),
)

console.log(serialize.text(graph))
