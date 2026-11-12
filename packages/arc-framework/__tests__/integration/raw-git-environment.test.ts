/** Both byte-preserving process bindings remove requested and repository-local environment variables. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpawnRawGitExec } from "../../src/lib/change-facts.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

let cwd: string;
beforeEach(async () => { cwd = await createTempRepo("arc-raw-env-"); });
afterEach(async () => { vi.unstubAllEnvs(); await cleanupTempDir(cwd); });

describe("requested raw Git environment removals", () => {
  it.each([["execa", createExecaRawGitExec], ["spawn", createSpawnRawGitExec]] as const)("%s removes named variables while preserving the fixed filter", async (_name, bind) => {
    vi.stubEnv("ARC_REMOVE_ME", "ambient");
    vi.stubEnv("GIT_DIR", "/does-not-select-this-repository");
    const result = await bind(cwd)([
      "-c", "alias.probe=!printf '%s|%s' \"${ARC_REMOVE_ME-unset}\" \"${GIT_DIR-unset}\"",
      "probe",
    ], { removeEnvironment: ["ARC_REMOVE_ME"] });
    expect(Buffer.from(result.stdout).toString()).toBe("unset|unset");
  });
});
