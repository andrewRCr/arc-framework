/** Qualification-only native discovery, assignment and worker-event observations. */
import type { ViteUserConfig } from "vitest/config";
import type { Reporter } from "vitest/reporters";
import type { TestModule, TestSpecification, Vitest } from "vitest/node";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { HeavyFirstSequencer } from "./heavy-first-sequencer.js";

const member = z.object({ project: z.string(), file: z.string() });
const observation = z.object({
  cycle: z.int().positive(),
  shard: z.object({ index: z.int().positive(), count: z.int().positive() }).optional(),
  selected: z.array(member), assigned: z.array(member), ordered: z.array(member),
  queued: z.array(member), ended: z.array(member),
  shardCalls: z.int().nonnegative(), sortCalls: z.int().nonnegative(),
});

export type NativeMember = z.infer<typeof member>;
export type NativeShardObservation = z.infer<typeof observation>;
const prefix = "ARC_NATIVE_SHARD_OBSERVATION ";
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const recordings = new WeakMap<Vitest, { cycles: number; current?: NativeShardObservation }>();

function identity(module: Pick<TestSpecification, "project" | "moduleId">): NativeMember {
  return { project: module.project.name, file: relative(packageRoot, module.moduleId).replaceAll("\\", "/") };
}

function current(controller: Vitest): NativeShardObservation {
  const value = recordings.get(controller)?.current;
  if (value === undefined) throw new Error("Native sequencing or worker event occurred outside an observed run.");
  return value;
}

class ObservedSequencer extends HeavyFirstSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const assigned = await super.shard(files);
    const record = current(this.ctx);
    record.shardCalls++;
    record.assigned = assigned.map(identity);
    return assigned;
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    const record = current(this.ctx);
    record.sortCalls++;
    if (record.shard === undefined) record.assigned = files.map(identity);
    record.ordered = ordered.map(identity);
    return ordered;
  }
}

class MembershipReporter implements Reporter {
  private controller!: Vitest;

  onInit(controller: Vitest): void {
    this.controller = controller;
    recordings.set(controller, { cycles: 0 });
  }

  onTestRunStart(specifications: readonly TestSpecification[]): void {
    const state = recordings.get(this.controller)!;
    const shard = this.controller.config.shard;
    state.current = { cycle: ++state.cycles, ...(shard === undefined ? {} : { shard: { ...shard } }),
      selected: specifications.map(identity), assigned: [], ordered: [], queued: [], ended: [], shardCalls: 0, sortCalls: 0 };
  }

  onTestModuleQueued(module: TestModule): void { current(this.controller).queued.push(identity(module)); }

  onTestModuleEnd(module: TestModule): void { current(this.controller).ended.push(identity(module)); }

  onTestRunEnd(): void {
    process.stdout.write(`\n${prefix}${JSON.stringify(current(this.controller))}\n`);
  }
}

/** Extend a native configuration with observational sequencing and reporting. */
export function observeNativeShards(base: ViteUserConfig): ViteUserConfig {
  const test = base.test ?? {};
  const reporters = test.reporters === undefined ? ["default" as const]
    : Array.isArray(test.reporters) ? test.reporters : [test.reporters];
  return { ...base, test: { ...test, sequence: { ...test.sequence, sequencer: ObservedSequencer },
    reporters: [...reporters, new MembershipReporter()] } };
}

/** Read only the qualification reporter's structured observations from native stdout. */
export function readNativeShardObservations(stdout: string): NativeShardObservation[] {
  return stdout.split(/\r?\n/u).filter(line => line.startsWith(prefix))
    .map(line => observation.parse(JSON.parse(line.slice(prefix.length))));
}
