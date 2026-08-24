import { ImplicationGraph } from './graph.js';
import { flattenRules, type EdgeDetails, type RuleContext, type RuleInput } from './rule-core.js';
import type { World } from './world.js';

export interface CompilerOptions {
  readonly maxPasses?: number;
}

export interface Compilation {
  readonly graph: ImplicationGraph;
  readonly passes: number;
}

export class RuleExecutionError extends Error {
  constructor(
    readonly ruleName: string,
    readonly pass: number,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    super(`Rule "${ruleName}" failed on pass ${pass}${detail}`, { cause });
    this.name = 'RuleExecutionError';
  }
}

export class CompilerConvergenceError extends Error {
  constructor(
    readonly maxPasses: number,
    readonly changingRules: readonly string[],
  ) {
    super(
      `World did not stabilize after ${maxPasses} compilation passes` +
      (changingRules.length ? `; rules still mutating it: ${changingRules.join(', ')}` : ''),
    );
    this.name = 'CompilerConvergenceError';
  }
}

/**
 * Rules materialize a fresh graph from the current World on every pass.
 * If any rule mutates World, that pass is discarded and recomputed. This prevents
 * stale implications when a derived component is replaced rather than only appended.
 */
export class Compiler {
  readonly maxPasses: number;

  constructor(options: CompilerOptions = {}) {
    this.maxPasses = options.maxPasses ?? 32;
  }

  run(world: World, ...inputs: readonly RuleInput[]): Compilation {
    const rules = [...flattenRules(inputs)].sort((a, b) => a.priority - b.priority);
    let changingRules: string[] = [];

    for (let pass = 1; pass <= this.maxPasses; pass++) {
      const worldBefore = world.revision;
      const graph = new ImplicationGraph();
      changingRules = [];

      for (const currentRule of rules) {
        const ruleWorldBefore = world.revision;
        const emit = (child: string, parent: string, details: EdgeDetails = {}) => graph.add(child, parent, {
          rule: currentRule.name,
          ...(details.reason === undefined ? {} : { reason: details.reason }),
          ...(details.source === undefined ? {} : { source: details.source }),
        });
        const context: RuleContext = {
          world,
          graph,
          pass,
          emit,
          edge: ({ child, parent, reason, source }) => emit(child, parent, {
            ...(reason === undefined ? {} : { reason }),
            ...(source === undefined ? {} : { source }),
          }),
        };
        try {
          currentRule.run(context);
        } catch (cause) {
          if (cause instanceof RuleExecutionError) throw cause;
          throw new RuleExecutionError(currentRule.name, pass, cause);
        }
        if (world.revision !== ruleWorldBefore) changingRules.push(currentRule.name);
      }

      if (world.revision === worldBefore) return { graph, passes: pass };
    }

    throw new CompilerConvergenceError(this.maxPasses, changingRules);
  }
}

/** Happy path: compile a world and return the implication graph directly. */
export function compile(world: World, ...rules: readonly RuleInput[]): ImplicationGraph {
  return new Compiler().run(world, ...rules).graph;
}
