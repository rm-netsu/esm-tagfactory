import type { Tag } from './component.js';
import type { ImplicationGraph } from './graph.js';
import type { World } from './world.js';

export interface EdgeDetails {
  readonly reason?: string;
  readonly source?: string;
}

export interface EdgeDraft extends EdgeDetails {
  readonly child: Tag;
  readonly parent: Tag;
}

export interface RuleContext {
  readonly world: World;
  readonly graph: ImplicationGraph;
  readonly pass: number;
  emit(child: Tag, parent: Tag, details?: EdgeDetails): boolean;
  edge(draft: EdgeDraft): boolean;
}

export interface Rule {
  readonly name: string;
  readonly priority: number;
  run(context: RuleContext): void;
}

export type RuleInput = Rule | Iterable<RuleInput>;

export function customRule(
  name: string,
  run: (context: RuleContext) => void,
  options: { readonly priority?: number } = {},
): Rule {
  return { name, priority: options.priority ?? 0, run };
}

function isRule(input: RuleInput): input is Rule {
  return typeof input === 'object'
    && input !== null
    && 'run' in input
    && typeof input.run === 'function'
    && 'name' in input;
}

export function* flattenRules(inputs: Iterable<RuleInput>): IterableIterator<Rule> {
  for (const input of inputs) {
    if (isRule(input)) {
      yield input;
      continue;
    }
    if (typeof input === 'string' || input == null || !(Symbol.iterator in Object(input))) {
      throw new TypeError('Invalid rule input: expected a Rule or an iterable of Rules');
    }
    yield* flattenRules(input);
  }
}
