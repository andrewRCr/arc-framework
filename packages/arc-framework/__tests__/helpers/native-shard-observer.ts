/** Qualification-only native discovery, assignment and worker-event observations. */
import type { ViteUserConfig } from "vitest/config";
import type { Reporter } from "vitest/reporters";
import type { TestModule, TestSpecification, Vitest } from "vitest/node";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { nativeObservationPrefix, type NativeMember, type NativeShardObservation, type NativeDurationInput } from "./native-shard-evidence.js";
export { readNativeShardObservations, type NativeMember, type NativeShardObservation } from "./native-shard-evidence.js";
import { HeavyFirstSequencer } from "./heavy-first-sequencer.js";

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
    state.current = { cycle: ++state.cycles,
      runtime: { node: process.version, vitest: this.controller.version, platform: process.platform, arch: process.arch },
      duration: observedDuration(), ...(shard === undefined ? {} : { shard: { ...shard } }),
      selected: specifications.map(identity), assigned: [], ordered: [], queued: [], ended: [], shardCalls: 0, sortCalls: 0 };
  }

  onTestModuleQueued(module: TestModule): void { current(this.controller).queued.push(identity(module)); }

  onTestModuleEnd(module: TestModule): void { current(this.controller).ended.push(identity(module)); }

  onTestRunEnd(): void {
    process.stdout.write(`\n${nativeObservationPrefix}${JSON.stringify(current(this.controller))}\n`);
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

function observedDuration(): NativeDurationInput {
  const path = process.env.ARC_TEST_DURATION_FILE;
  if (path === undefined || path === "") return { kind: "file", state: path === undefined ? "unset" : "empty" };
  const bytes = readFileSync(path);
  return { kind: "file", state: "file", digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, bytes: bytes.length };
}
