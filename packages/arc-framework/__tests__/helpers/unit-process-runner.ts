/** Finalize unit admission before native file completion, including skipped and collection-failed files. */
import type { Suite } from "@vitest/runner";
import { VitestTestRunner } from "vitest/runners";
import { finalizeUnitProcessGuard } from "./unit-process-guard.js";

/** Preserve native Vitest execution while publishing final unit-file launch accounting. */
export default class UnitProcessRunner extends VitestTestRunner {
  /**
   * Publish admission for files whose early completion skips the after-suite hook.
   * @param suite - Native suite entering execution.
   * @returns After native setup and any early file admission finalization.
   */
  override async onBeforeRunSuite(suite: Suite): Promise<void> {
    await super.onBeforeRunSuite(suite);
    if (suite === suite.file && (suite.result?.state === "fail" || suite.mode === "skip" || suite.mode === "todo")) {
      await finalizeUnitProcessGuard(suite.file);
    }
  }

  /**
   * Finalize file admission after native hooks, fixtures and aroundAll cleanup, before its completion event.
   * @param suite - Native suite whose teardown has completed.
   * @returns After native snapshot completion and final file admission publication.
   */
  override async onAfterRunSuite(suite: Suite): Promise<void> {
    await super.onAfterRunSuite(suite);
    if (suite === suite.file) await finalizeUnitProcessGuard(suite.file);
  }
}
