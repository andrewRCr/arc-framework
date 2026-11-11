/** Observe native Git boundaries and complete operations without changing their scheduling. */
import { performance } from "node:perf_hooks";
import { createDefaultRefStorePorts, createRefStore } from "../../../../src/lib/store/index.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

interface Invocation { argv: string[]; startMs: number; endMs: number }
export interface TimingSample { wallMs: number; gitCalls: number; gitGroups: number; gitSingles: number; gitPairs: number; gitWallMs: number; gitCommands: Record<string, number> }

export class ProjectionTimingObserver {
  private calls: Invocation[] | null = null;
  private async observe<T>(argv: string[], run: () => Promise<T>): Promise<T> {
    const calls = this.calls, startMs = performance.now();
    try { return await run(); }
    finally { calls?.push({ argv, startMs, endMs: performance.now() }); }
  }
  client(checkout: string) {
    const native = createDefaultRefStorePorts({ checkoutRoot: checkout, backingRepository: async () => null });
    const ports = { ...native,
      exec: ((command, args, options) => this.observe(args, () => native.exec(command, args, options))) as typeof native.exec,
      execInput: ((args, input, options) => this.observe(args, () => native.execInput(args, input, options))) as typeof native.execInput,
      rawExec: ((args, options) => this.observe(args, () => native.rawExec(args, options))) as typeof native.rawExec };
    const engine = createProjectionEnginePorts(checkout);
    const enginePorts = { ...engine,
      exec: ((command, args, options) => this.observe(args, () => engine.exec(command, args, options))) as typeof engine.exec,
      execInput: ((args, input, options) => this.observe(args, () => engine.execInput(args, input, options))) as typeof engine.execInput };
    return { store: createRefStore(ports), ports, enginePorts };
  }
  async measure<T>(run: () => Promise<T>): Promise<{ value: T; sample: TimingSample }> {
    if (this.calls !== null) throw new Error("Nested native timing observations");
    const calls: Invocation[] = []; this.calls = calls;
    const start = performance.now();
    try {
      const value = await run(), wallMs = performance.now() - start;
      const groups: { end: number; count: number }[] = [];
      let gitWallMs = 0, through = 0;
      for (const call of calls.sort((left, right) => left.startMs - right.startMs)) {
        gitWallMs += Math.max(0, call.endMs - Math.max(through, call.startMs));
        through = Math.max(through, call.endMs);
        const group = groups.at(-1);
        if (group !== undefined && call.startMs < group.end) { group.end = Math.max(group.end, call.endMs); group.count++; }
        else groups.push({ end: call.endMs, count: 1 });
      }
      const gitCommands: Record<string, number> = {};
      const verbs = new Set(["config", "worktree", "for-each-ref", "cat-file", "check-ignore", "ls-files", "symbolic-ref", "rev-parse", "rev-list", "show", "ls-tree"]);
      for (const call of calls) {
        const verb = call.argv.find(arg => verbs.has(arg)) ?? call.argv[0] ?? "unknown";
        gitCommands[verb] = (gitCommands[verb] ?? 0) + 1;
      }
      return { value, sample: { wallMs, gitCalls: calls.length, gitGroups: groups.length,
        gitSingles: groups.filter(group => group.count === 1).length,
        gitPairs: groups.filter(group => group.count > 1).length, gitWallMs, gitCommands } };
    } finally { this.calls = null; }
  }
}

export function medianTiming(samples: readonly TimingSample[]) {
  const median = (values: number[]) => values.sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
  return { medianMs: median(samples.map(sample => sample.wallMs)),
    medianGitCalls: median(samples.map(sample => sample.gitCalls)), medianGitGroups: median(samples.map(sample => sample.gitGroups)),
    medianGitSingles: median(samples.map(sample => sample.gitSingles)), medianGitPairs: median(samples.map(sample => sample.gitPairs)),
    samples };
}
