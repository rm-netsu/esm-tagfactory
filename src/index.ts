export {
	components,
	field,
	flag,
	links,
	type AnyComponent,
	type AppendLinksFact,
	type ComponentOptions,
	type ComponentSet,
	type EntityId,
	type FieldComponent,
	type FlagComponent,
	type LinksComponent,
	type ReadableComponent,
	type SetFact,
	type Tag,
	type Trait,
} from './component.js'

export {
	Entity,
	World,
	world,
	type WorldDefinition,
} from './world.js'

export {
	Query,
	query,
	type EntityPredicate,
	type EntitySet,
} from './query.js'

export {
	Relation,
	relation,
	type RelationLike,
	type RelationPredicate,
	type RelationResolver,
} from './relation.js'

export {
	tag,
	type CompoundRenderer,
	type TagProjection,
} from './tag.js'

export {
	CompoundDomain,
	CompoundRejectedError,
	CompoundTagCollisionError,
	compound,
	type Compound,
	type CompoundCanonicalizer,
	type CompoundEnumerator,
	type CompoundParser,
	type CustomDomainOptions,
	type MemberComparator,
	type OrderedDomainOptions,
	type SymmetricDomainOptions,
} from './compound.js'

export {
	ImplicationCycleError,
	ImplicationGraph,
	type Explanation,
	type GraphView,
	type ImplicationEdge,
	type Provenance,
} from './graph.js'

export type {
	EdgeDetails,
	EdgeDraft,
	Rule,
	RuleContext,
	RuleInput,
} from './rule-core.js'

export {
	ProductTagCollisionError,
	rule,
	type CompoundMemberContext,
	type CompoundRuleOptions,
	type HierarchyRuleOptions,
	type MemberProjection,
	type MemberRelationResolver,
	type ProductAxis,
	type ProductRuleOptions,
} from './rules.js'

export {
	Compiler,
	CompilerConvergenceError,
	RuleExecutionError,
	compile,
	type Compilation,
	type CompilerOptions,
} from './compiler.js'

export {
	serialize,
	type SerializeOptions,
} from './serialize.js'
