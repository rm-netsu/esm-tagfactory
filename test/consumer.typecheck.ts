import {
	compile,
	components,
	compound,
	field,
	flag,
	links,
	query,
	relation,
	rule,
	tag,
	world,
	type TagProjection,
} from '../src/index.js'

const C = components({
	Color: flag(),
	Enabled: flag(),
	Super: links(),
	Order: field<number>(),
	Label: field<string>(),
})

const ontology = world({
	blue: [C.Color, C.Order(1), C.Label('Blue')],
	navy: [C.Color, C.Enabled, C.Order(2), C.Super('blue')],
})

ontology.patch('navy', C.Order(3), C.Super('blue'))
const order: number | undefined = ontology.get('navy', C.Order)
void order

// @ts-expect-error Order is numeric.
C.Order('not-a-number')
// @ts-expect-error Label is textual.
C.Label(123)

const colors = query(C.Color).where((entity) => entity.has(C.Order))
const supers = relation(C.Super).transitive()
const projection: TagProjection = tag.from(C.Label, tag.id)

const pairs = compound.symmetric({
	members: colors,
	orderBy: C.Order,
	render: tag.join('_'),
})

const graph = compile(
	ontology,
	rule.hierarchy({ members: colors, parents: supers }),
	rule.compound({ domain: pairs, decompose: projection }),
)

void graph
