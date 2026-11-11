/** Bind the real refresh and its end check to the shared save-loss harness's faithful take-in. */
import type { SaveLossRun, SaverResult } from "./save-loss.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { bindProjectionRoot } from "../../../../src/lib/store/projection/engine-binding.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionConfiguration } from "../../../../src/lib/store/projection/configuration.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { checkIgnores } from "../../../../src/lib/store/projection/ignore-check.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import { refreshProjectionRoot } from "../../../../src/lib/store/projection/refresh.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import type { SwapHooks } from "../../../../src/lib/store/projection/swap.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";
import { SWAP_WRITER } from "./swap-fixture.js";

/** Run a refresh under its native lease, then finish the trial's save before checking retained copies. */
export async function runSaveLossRefresh(input: {
  run: SaveLossRun; index: ProjectionIndex; takeIn: TakeInPort; hooks: SwapHooks;
  saved: Promise<SaverResult> | undefined; secondCheck: () => void;
}): Promise<{ index: ProjectionIndex; settled: string[] }> {
  const { run, takeIn } = input;
  const { checkout, location } = run.seeded;
  const result = await withProjectionLock(location, async session => {
    const exec = createExecaGitExec();
    const readConfiguration = () => readProjectionConfiguration(exec, checkout);
    const configuration = { ...await readConfiguration(), identity: { status: "identified" as const,
      identity: input.index.projectedUnder.identity } };
    const ports = { ...createProjectionEnginePorts(checkout), writer: async () => SWAP_WRITER };
    const bound = await bindProjectionRoot({ checkout, location, store: run.store, configuration, ports, session,
      actor: "save-loss", history: createHistoryMemo(run.store), register: false });
    const ignore = await checkIgnores({ guard: { root: checkout, identity: bound.identity, exec: ports.execInput, fs: ports.fs },
      records: input.index.ignoreFiles, recordedGuard: input.index.ignoreGuard, reference: await readReference(checkout),
      format: "sha1", ignoreRules: configuration.ignoreRules, readIgnoreRules: async () => (await readConfiguration()).ignoreRules });
    if (ignore.kind === "refused") throw new Error("The save-loss fixture's ignore policy was refused");
    const root = { ...bound, takeIn, writable: () => true,
      context: { ...bound.context, takeIn, hooks: input.hooks } };
    const version = await run.store.version();
    if (version.status !== "ok") throw new Error("The fixture refused its version");
    const index = await refreshProjectionRoot({ root, source: run.store, version: version.result, configuration,
      index: ignore.kind === "passed" ? { ...input.index, ignoreFiles: [...ignore.records], ignoreGuard: ignore.basis } : input.index });
    await input.saved;
    input.secondCheck();
    const checked = await runSecondCheck({ location, checkout, index, copies: root.copies, removals: root.removals,
      format: "sha1", takeIn, writer: SWAP_WRITER, checkpoint: session.step });
    return { index: checked.index, settled: checked.settled.map(each => each.settlement.kind) };
  });
  if (result.status !== "done") throw new Error(`The save-loss refresh did not complete: ${result.status}`);
  return result.value;
}
