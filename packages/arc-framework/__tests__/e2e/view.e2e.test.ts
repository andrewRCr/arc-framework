/**
 * End-to-end tests for the non-TTY `arc view` contract.
 */

import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  runArc,
  runArcNoTty,
  runArcWithStdin,
} from "./helpers.js";

describe("arc view", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempRepo("arc-view-e2e-");
    await mkdir(join(cwd, ".arc", "active"), { recursive: true });
    await writeFile(join(cwd, ".arc", "active", "meta-feature.md"), [
      "# Metadata: feature",
      "",
      "- **State:** Active",
      "- **Branch:** main",
      "- **Task List:** tasks-feature.md",
      "- **Next Action:** Continue implementation",
      "",
    ].join("\n"));
    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"), [
      "# Task List: feature",
      "",
      "- [ ] First task",
      "",
    ].join("\n"));
  });

  afterEach(async () => cleanupTempDir(cwd));

  it("writes the plain artifact body with no ANSI decoration", async () => {
    const result = await runArcNoTty(["view"], cwd);

    expect(result).toEqual({
      stdout: "# Task List: feature\n\n- [ ] First task\n",
      stderr: "",
      exitCode: 0,
    });
    expect(result.stdout).not.toContain("\u001b[");
  });

  it("does not hang when stdin is piped", async () => {
    const result = await runArcWithStdin(["view", "tasks"], cwd, "ignored input\n", {
      timeout: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Task List: feature");
  });

  it("teaches valid kinds on an unknown-kind error", async () => {
    const result = await runArcNoTty(["view", "bogus"], cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown view kind \"bogus\"");
    expect(result.stderr).toContain("tasks, spec, draft, meta");
  });

  it("composes a detected renderer through pager mode exactly once under a TTY", async () => {
    const { binDir, logPath } = await installFakeGlow(cwd);
    const result = await runArc(["view", "tasks"], cwd, {
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        ARC_VIEW_RENDER_LOG: logPath,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Task List: feature");
    expect(await readFile(logPath, "utf8")).toBe("--version\n--pager -\n");
  });

  it("does not probe or spawn a renderer under non-TTY", async () => {
    const { binDir, logPath } = await installFakeGlow(cwd);
    const result = await runArcNoTty(["view", "tasks"], cwd, {
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        ARC_VIEW_RENDER_LOG: logPath,
      },
    });

    expect(result.exitCode).toBe(0);
    await expect(access(logPath)).rejects.toThrow();
  });
});

async function installFakeGlow(cwd: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = join(cwd, "fake-bin");
  const logPath = join(cwd, "renderer.log");
  const executable = join(binDir, "glow");
  await mkdir(binDir, { recursive: true });
  await writeFile(executable, [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "if [ \"$1\" = \"--version\" ]; then",
    "  printf 'glow test version\\n'",
    "  exit 0",
    "fi",
    "cat",
    "",
  ].join("\n"));
  await chmod(executable, 0o755);
  return { binDir, logPath };
}
