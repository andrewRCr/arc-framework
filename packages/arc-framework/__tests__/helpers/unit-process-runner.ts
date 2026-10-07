/** Finalize unit admission after returned hook cleanups, file fixtures and aroundAll teardown. */
import { updateTask, type File } from "@vitest/runner";
import { VitestTestRunner } from "vitest/runners";
import { finalizeUnitProcessGuard } from "./unit-process-guard.js";

/** Preserve native Vitest execution while publishing final unit-file launch accounting. */
export default class UnitProcessRunner extends VitestTestRunner {
  /**
   * Finalize every completed file before the native task-update flush.
   * @param files - Files in the completed native run.
   * @returns After file admission metadata, failure state and native runner cleanup are complete.
   */
  override async onAfterRunFiles(files: File[] = []): Promise<void> {
    try {
      for (const file of files) {
        await finalizeUnitProcessGuard(file);
        updateTask("suite-finished", file, this);
      }
    } finally { super.onAfterRunFiles(); }
  }
}
