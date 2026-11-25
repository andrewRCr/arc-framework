/** Unit coverage for the session-init advisory over the entering checkout's hooks path. */

import { describe, expect, it, vi } from "vitest";

import type { HooksPathGitExec } from "../../../src/lib/git/hooks-path.js";
import {
  HooksPathSessionAdvisorySchema,
  runHooksPathSessionAdvisory,
} from "../../../src/lib/session-init/hooks-path-advisory.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

function hooksExec(resolved: string, configured: string | null): HooksPathGitExec {
  const scripted = scriptGitExec([
    { match: ["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
      responses: [{ stdout: `${resolved}\n`, stderr: "" }] },
    { match: ["config", "--get", "core.hooksPath"],
      responses: [configured === null
        ? { failure: { exitCode: 1, stderr: "key unset" } }
        : { stdout: `${configured}\n`, stderr: "" }] },
  ]);
  return (command, args, opts) => scripted.exec(command, [...args], opts);
}

describe("runHooksPathSessionAdvisory", () => {
  it("names a configured hooks path that does not exist in the checkout", async () => {
    const advisory = await runHooksPathSessionAdvisory({
      cwd: "/worktree",
      exec: hooksExec("/worktree/.husky/_", ".husky/_"),
      pathExists: vi.fn(() => false),
    });

    expect(HooksPathSessionAdvisorySchema.parse(advisory)).toEqual(advisory);
    expect(advisory).toMatchObject({
      recommendedAction: "surface",
      configured: ".husky/_",
      resolvedPath: "/worktree/.husky/_",
    });
    if (advisory.recommendedAction !== "surface") throw new Error("expected a surfaced advisory");
    expect(advisory.recommendedPromptText).toContain("'.husky/_'");
    expect(advisory.recommendedPromptText).toContain("/worktree/.husky/_");
    expect(advisory.recommendedPromptText).toContain("runs no hooks");
    expect(advisory.recommendedPromptText).toContain("git commit");
  });

  it("names Git's default hooks directory when no hooks path is configured and it is missing", async () => {
    const advisory = await runHooksPathSessionAdvisory({
      cwd: "/repo",
      exec: hooksExec("/repo/.git/hooks", null),
      pathExists: () => false,
    });

    expect(advisory).toMatchObject({ recommendedAction: "surface", configured: null });
    if (advisory.recommendedAction !== "surface") throw new Error("expected a surfaced advisory");
    expect(advisory.recommendedPromptText).toContain("/repo/.git/hooks");
    expect(advisory.recommendedPromptText).not.toContain("core.hooksPath ''");
  });

  it("stays silent when the hooks path exists", async () => {
    await expect(runHooksPathSessionAdvisory({
      cwd: "/worktree",
      exec: hooksExec("/worktree/.husky/_", ".husky/_"),
      pathExists: () => true,
    })).resolves.toEqual({ recommendedAction: "none" });
  });

  it("stays silent for an intentionally disabled hooks path", async () => {
    await expect(runHooksPathSessionAdvisory({
      cwd: "/worktree",
      exec: hooksExec("/dev/null", "/dev/null"),
      pathExists: () => false,
    })).resolves.toEqual({ recommendedAction: "none" });
  });
});

describe("HooksPathSessionAdvisorySchema", () => {
  it("refuses a surfaced advisory without its prompt text", () => {
    expect(HooksPathSessionAdvisorySchema.safeParse({
      recommendedAction: "surface",
      configured: ".husky/_",
      resolvedPath: "/worktree/.husky/_",
    }).success).toBe(false);
  });

  it("refuses detail on a silent advisory", () => {
    expect(HooksPathSessionAdvisorySchema.safeParse({
      recommendedAction: "none",
      resolvedPath: "/worktree/.husky/_",
    }).success).toBe(false);
  });
});
