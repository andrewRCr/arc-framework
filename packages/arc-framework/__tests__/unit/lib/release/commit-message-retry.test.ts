/** Unit tests for safe latest-retry command rendering. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  quoteShellArgument,
  renderCommitMessageRetryCommand,
} from "../../../../src/lib/release/commit-message-retry.js";

const execFileAsync = promisify(execFile);

describe("renderCommitMessageRetryCommand", () => {
  it("renders only the wrapper-owned absolute path", () => {
    const path = "/repo with spaces/$HOME;$(touch nope)/it's/.git/.arc-release-commit-message-retry";

    const command = renderCommitMessageRetryCommand(path);

    expect(command).toBe(`arc release commit -F ${quoteShellArgument(path)}`);
    expect(command).not.toContain("COMMIT_EDITMSG");
  });

  it.runIf(process.platform !== "win32")(
    "round-trips spaces and shell metacharacters through the host shell",
    async () => {
      const path = "/repo with spaces/$HOME;$(touch nope)/it's/retry";
      const { stdout } = await execFileAsync("/bin/sh", [
        "-c",
        `set -- ${quoteShellArgument(path)}; printf %s "$1"`,
      ]);

      expect(stdout).toBe(path);
    },
  );
});
