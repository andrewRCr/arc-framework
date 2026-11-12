import { describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import {
  configureRoadmapConflictRemedy,
  ROADMAP_MERGE_DRIVER_COMMAND,
  ROADMAP_MERGE_DRIVER_NAME,
} from "../../src/lib/setup.js";

describe("configureRoadmapConflictRemedy", () => {
  it("recovers from transient local Git config contention without inspecting its diagnostic", async () => {
    const configured = new Map<string, string>();
    let lockPending = true;
    const exec: GitExec = async (command, args) => {
      const [, scope, key, value] = args;
      if (command !== "git" || scope !== "--local" || key === undefined || value === undefined) {
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      }
      if (lockPending) {
        lockPending = false;
        throw new GitProcessError({
          kind: "nonzero-exit",
          command,
          args,
          exitCode: 255,
          stderr: "localized Git config lock failure",
        });
      }
      configured.set(key, value);
      return { stdout: "" };
    };

    await configureRoadmapConflictRemedy(
      {
        cwd: "/repo",
        exec,
        readFile: async () => "",
        writeFile: async () => undefined,
        waitForRetry: async () => undefined,
      },
      false,
    );

    expect(Object.fromEntries(configured)).toEqual({
      "merge.arc-roadmap.name": ROADMAP_MERGE_DRIVER_NAME,
      "merge.arc-roadmap.driver": ROADMAP_MERGE_DRIVER_COMMAND,
    });
  });

  it("surfaces a different Git failure encountered after a lock retry", async () => {
    const lockError = new GitProcessError({
      kind: "nonzero-exit",
      command: "git",
      args: ["config"],
      exitCode: 255,
      stderr: "error: could not lock config file .git/config: File exists",
    });
    const permissionError = new GitProcessError({
      kind: "nonzero-exit",
      command: "git",
      args: ["config"],
      exitCode: 255,
      stderr: "error: could not lock config file .git/config: Permission denied",
    });
    let attempt = 0;
    const exec: GitExec = async () => {
      attempt += 1;
      throw attempt === 1 ? lockError : permissionError;
    };

    await expect(configureRoadmapConflictRemedy(
      {
        cwd: "/repo",
        exec,
        readFile: async () => "",
        writeFile: async () => undefined,
        waitForRetry: async () => undefined,
      },
      false,
    )).rejects.toBe(permissionError);
  });
});
