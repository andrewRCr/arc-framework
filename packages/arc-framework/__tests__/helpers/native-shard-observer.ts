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
const recordings = new WeakMap<Vitest, { cycles: number; emptyReported?: boolean; current?: NativeShardObservation;
  preflight?: NativeShardObservation["preflight"] }>();

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
    const state = recordings.get(this.ctx);
    if (state?.cycles === 0 && state.current === undefined) {
      state.preflight = { selected: files.map(identity), assigned: assigned.map(identity),
        shardCalls: (state.preflight?.shardCalls ?? 0) + 1 };
      return assigned;
    }
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
    const close = controller.close.bind(controller);
    controller.close = async () => {
      await close();
      const state = recordings.get(controller)!;
      const preflight = state.preflight;
      const shard = controller.config.shard;
      if (state.emptyReported || state.cycles !== 0 || state.current !== undefined || shard === undefined
        || preflight === undefined || preflight.shardCalls !== 1
        || preflight.selected.length === 0 || preflight.assigned.length !== 0) return;
      state.emptyReported = true;
      const record: NativeShardObservation = { cycle: 0, closed: true,
        runtime: { node: process.version, vitest: controller.version, platform: process.platform, arch: process.arch },
        duration: observedDuration(), shard: { ...shard }, selected: preflight.selected,
        assigned: [], ordered: [], queued: [], ended: [], shardCalls: 0, sortCalls: 0, preflight };
      process.stdout.write(`\n${nativeObservationPrefix}${JSON.stringify(record)}\n`);
    };
  }

  onTestRunStart(specifications: readonly TestSpecification[]): void {
    const state = recordings.get(this.controller)!;
    const shard = this.controller.config.shard;
    state.current = { cycle: ++state.cycles,
      runtime: { node: process.version, vitest: this.controller.version, platform: process.platform, arch: process.arch },
      duration: observedDuration(), ...(shard === undefined ? {} : { shard: { ...shard } }),
      selected: specifications.map(identity), assigned: [], ordered: [], queued: [], ended: [], shardCalls: 0, sortCalls: 0,
      ...(state.preflight === undefined ? {} : { preflight: state.preflight }) };
  }

  onTestModuleQueued(module: TestModule): void { current(this.controller).queued.push(identity(module)); }

  onTestModuleEnd(module: TestModule): void { current(this.controller).ended.push(identity(module)); }

  onTestRunEnd(): void {
    process.stdout.write(`\n${nativeObservationPrefix}${JSON.stringify(current(this.controller))}\n`);
    recordings.get(this.controller)!.current = undefined;
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
