/**
 * End-to-end tests for the non-TTY `arc view` contract.
 */

import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcNoTty,
  runArcWithStdoutPipe,
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
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 First task**",
      "",
      "- _Goal:_ Complete the first task.",
      "",
    ].join("\n"));
  });

  afterEach(async () => cleanupTempDir(cwd));

  it("writes the plain artifact body with no ANSI decoration", async () => {
    const result = await runArcNoTty(["view"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^Phase 1\/1 · Task 1\.1 · 0\/1 overall · rendered \d{2}:\d{2}/u);
    expect(result.stdout).toContain("# Task List: feature");
    expect(result.stdout).not.toContain("\u001b[");
  });

  it("uses conventional task fallback and bare lifecycle selection", async () => {
    await writeFile(join(cwd, ".arc", "active", "meta-feature.md"), [
      "# Metadata: feature", "", "- **State:** Active", "- **Branch:** main", "- **Task List:** [none]", "",
    ].join("\n"));
    const forming = await runArcNoTty(["view"], cwd);
    expect(forming.stdout).toContain("# Task List: feature");

    await rm(join(cwd, ".arc", "active", "tasks-feature.md"));
    await writeFile(join(cwd, ".arc", "active", "spec-feature.md"), "# Forming spec\n");
    const spec = await runArcNoTty(["view"], cwd);
    expect(spec.stdout).toMatch(/^spec · feature · 1 line · rendered /u);
    expect(spec.stdout).toContain("# Forming spec");
  });

  it("resolves checkout-local explicit targets and fails closed on misses", async () => {
    const planned = join(cwd, ".arc", "backlog", "planned");
    await mkdir(planned, { recursive: true });
    await writeFile(join(planned, "meta-planned.md"), [
      "# Metadata: planned", "", "- **State:** Planning", "- **Branch:** [none]", "- **Task List:** [none]", "",
    ].join("\n"));
    await writeFile(join(planned, "spec-planned.md"), "# Planned spec\n");

    const resolved = await runArcNoTty(["view", "spec", "--for", "planned"], cwd);
    expect(resolved.exitCode).toBe(0);
    expect(resolved.stdout).toContain("spec · planned · 1 line");
    expect(resolved.stdout).toContain("# Planned spec");

    const missing = await runArcNoTty(["view", "meta", "--for", "missing"], cwd);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("unavailable in this checkout");

    const invalid = await runArcNoTty(["view", "meta", "--for", "../bad"], cwd);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("Invalid work-unit slug");
  });

  it("applies the user-scoped clock to non-TTY headers and surfaces invalid overrides", async () => {
    await writeFile(join(cwd, ".arc", "active", "spec-feature.md"), "# Spec\n");
    await git(cwd, ["config", "arc.viewClock", "12h"]);
    const twelveHour = await runArcNoTty(["view", "spec"], cwd);
    expect(twelveHour.stdout).toMatch(/rendered \d{1,2}:\d{2} [AP]M/u);

    await git(cwd, ["config", "arc.viewClock", "locale"]);
    const invalid = await runArcNoTty(["view", "spec"], cwd);
    expect(invalid.stdout).toMatch(/rendered \d{2}:\d{2}/u);
    expect(invalid.stderr).toContain("warning: Ignoring invalid value \"locale\" for arc.viewClock");
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

  it("emits the bare current-task region and explicit degrade states", async () => {
    const current = await runArcNoTty(["view", "tasks", "--current"], cwd);
    expect(current).toEqual({
      stdout: "### `[ ]` **1.1 First task**\n\n- _Goal:_ Complete the first task.\n",
      stderr: "",
      exitCode: 0,
    });

    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"),
      "### `[x]` **1.1 Complete**\n");
    const terminal = await runArcNoTty(["view", "tasks", "--current"], cwd);
    expect(terminal).toEqual({ stdout: "No open task.\n", stderr: "", exitCode: 0 });

    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"),
      "### `[ ]` **1.1**\n");
    const malformed = await runArcNoTty(["view", "tasks", "--current"], cwd);
    expect(malformed.exitCode).toBe(0);
    expect(malformed.stdout).toBe("Current task unavailable: task list is malformed.\n");
    expect(malformed.stderr).toContain("warning: Task list is malformed at line 1");

    const fullMalformed = await runArcNoTty(["view", "tasks"], cwd);
    expect(fullMalformed.exitCode).toBe(0);
    expect(fullMalformed.stdout).toBe("### `[ ]` **1.1**\n");
    expect(fullMalformed.stderr).toContain("warning: Task list is malformed at line 1");
    expect(fullMalformed.stdout).not.toContain("rendered");
  });

  it.runIf(process.platform === "linux")(
    "composes a detected renderer through pager mode exactly once under a TTY",
    async () => {
      const { binDir, logPath } = await installFakeGlow(cwd);
      const result = await runArc(["view", "tasks"], cwd, {
        env: {
          CI: "false",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          ARC_VIEW_RENDER_LOG: logPath,
          GIT_CONFIG_GLOBAL: "/dev/null",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("# Task List: feature");
      expect(result.stderr).toBe("");
      expect(await readFile(logPath, "utf8"))
        .toBe("--version\nLESS=FRX +/###.*1\\.1\n--pager --width 0 -\n");
    },
  );

  it.runIf(process.platform === "linux")(
    "opens an anchor-capable pager at the shifted current-task line",
    async () => {
      const { binDir, logPath } = await installFakeBat(cwd);
      await git(cwd, ["config", "arc.viewRenderer", "bat"]);
      const result = await runArc(["view", "tasks"], cwd, {
        env: {
          CI: "false",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          ARC_VIEW_RENDER_LOG: logPath,
        },
      });

      expect(result.exitCode).toBe(0);
      const log = await readFile(logPath, "utf8");
      expect(log).toContain("BAT_PAGER=less -RFX +4");
      expect(log).toContain("--paging=always --style=plain --language=md");
    },
  );

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

  it.runIf(process.platform === "linux")("uses plain output when only stdout is piped", async () => {
    const { binDir, logPath } = await installFakeGlow(cwd);
    const result = await runArcWithStdoutPipe(["view", "tasks"], cwd, {
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        ARC_VIEW_RENDER_LOG: logPath,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Task List: feature");
    await expect(access(logPath)).rejects.toThrow();
  });

  it.runIf(process.platform === "linux")("preserves CLI failure through the stdout pipeline", async () => {
    const result = await runArcWithStdoutPipe(["view", "bogus"], cwd);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("Unknown view kind");
  });
});

async function installFakeGlow(cwd: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = join(cwd, "fake-bin");
  const logPath = join(cwd, "renderer.log");
  const executable = join(binDir, "glow");
  await mkdir(binDir, { recursive: true });
  await writeFile(executable, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then",
    "  printf '%s\\n' \"$*\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "  printf 'glow test version\\n'",
    "  exit 0",
    "fi",
    "printf 'LESS=%s\\n' \"$LESS\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "printf '%s\\n' \"$*\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "cat",
    "",
  ].join("\n"));
  await chmod(executable, 0o755);
  return { binDir, logPath };
}

async function installFakeBat(cwd: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = join(cwd, "fake-bin");
  const logPath = join(cwd, "renderer.log");
  const executable = join(binDir, "bat");
  await mkdir(binDir, { recursive: true });
  await writeFile(executable, [
    "#!/bin/sh",
    "printf 'BAT_PAGER=%s\\n' \"$BAT_PAGER\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "printf '%s\\n' \"$*\" >> \"$ARC_VIEW_RENDER_LOG\"",
    "cat",
    "",
  ].join("\n"));
  await chmod(executable, 0o755);
  return { binDir, logPath };
}
