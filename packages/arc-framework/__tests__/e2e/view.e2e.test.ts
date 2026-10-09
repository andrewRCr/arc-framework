/**
 * End-to-end tests for the non-TTY `arc view` contract.
 */

import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcNoTty,
  runArcWithStdoutPipe,
  runArcWithStdin,
} from "./helpers.js";

/** Presentation cases use semantic setup; selection cases keep independent literal evidence. */
async function writePresentationMeta(cwd: string): Promise<void> {
  await writeFile(join(cwd, ".arc", "active", "meta-feature.md"), makeMetaFixture("feature", {
    branch: "main", taskList: "tasks-feature.md", nextAction: "Continue implementation",
  }));
}

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

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(cwd);
  });

  it("writes the plain artifact body with no ANSI decoration", async () => {
    await writePresentationMeta(cwd);
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
    const provisional = join(cwd, ".arc", "backlog", "provisional");
    const completed = join(cwd, ".arc", "completed");
    await mkdir(planned, { recursive: true });
    await mkdir(provisional, { recursive: true });
    await mkdir(completed, { recursive: true });
    await mkdir(join(planned, "planned"), { recursive: true });
    await writeFile(join(planned, "planned", "meta-planned.md"), [
      "# Metadata: planned", "", "- **State:** Planning", "- **Branch:** [none]", "- **Task List:** [none]", "",
    ].join("\n"));
    await writeFile(join(planned, "planned", "spec-planned.md"), "# Planned spec\n");
    await writeFile(join(provisional, "meta-provisional.md"), [
      "# Metadata: provisional", "", "- **State:** Planning", "- **Branch:** [none]", "- **Task List:** [none]", "",
    ].join("\n"));
    await writeFile(join(completed, "meta-completed.md"), [
      "# Metadata: completed", "", "- **State:** Shipped", "- **Branch:** feat/completed", "- **Task List:** [none]", "",
    ].join("\n"));

    const active = await runArcNoTty(["view", "meta", "--for", "feature"], cwd);
    expect(active.exitCode).toBe(0);
    expect(active.stdout).toContain("meta · feature");

    const resolved = await runArcNoTty(["view", "spec", "--for", "planned"], cwd);
    expect(resolved.exitCode).toBe(0);
    expect(resolved.stdout).toContain("spec · planned · 1 line");
    expect(resolved.stdout).toContain("# Planned spec");

    const provisionalResult = await runArcNoTty(["view", "meta", "--for", "provisional"], cwd);
    expect(provisionalResult.exitCode).toBe(0);
    expect(provisionalResult.stdout).toContain("meta · provisional");

    const completedResult = await runArcNoTty(["view", "meta", "--for", "completed"], cwd);
    expect(completedResult.exitCode).toBe(1);
    expect(completedResult.stderr).toContain("completed viewing is unsupported");

    const missing = await runArcNoTty(["view", "meta", "--for", "missing"], cwd);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("unavailable in this checkout");

    const invalid = await runArcNoTty(["view", "meta", "--for", "../bad"], cwd);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("Invalid work-unit slug");
  });

  it.each([
    ["working-memory"],
    ["inbox"],
  ])("rejects --for with the identity-global %s surface", async (kind) => {
    const result = await runArcNoTty(["view", kind, "--for", "feature"], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("identity-global");
  });

  it("reads a started work unit's live checkout and then its ref without using the base backlog", async () => {
    const slug = "sibling";
    const branch = `feat/${slug}`;
    const backlog = join(cwd, ".arc/backlog/planned", slug);
    const checkout = join(cwd, "sibling-checkout");
    const specPath = join(checkout, `.arc/active/spec-${slug}.md`);
    await mkdir(backlog, { recursive: true });
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
    await writeFile(join(cwd, ".git/info/exclude"), "sibling-checkout/\n");
    await writeFile(join(backlog, `meta-${slug}.md`), makeMetaFixture(slug, {
      state: "Planning", branch: null, design: [`spec-${slug}.md`],
    }));
    await writeFile(join(backlog, `spec-${slug}.md`), "# Base backlog copy\n");
    await git(cwd, ["add", ".arc"]);
    await git(cwd, ["commit", "-m", "seed base backlog"]);
    await git(cwd, ["worktree", "add", "-b", branch, checkout]);
    try {
      await rm(join(checkout, ".arc/backlog/planned", slug), { recursive: true });
      await writeFile(join(checkout, `.arc/active/meta-${slug}.md`), makeMetaFixture(slug, {
        branch, design: [`spec-${slug}.md`],
      }));
      await writeFile(specPath, "# Started branch copy\n");
      await git(checkout, ["add", ".arc"]);
      await git(checkout, ["commit", "-m", "start sibling"]);
      await writeFile(specPath, "# Uncommitted live copy\n");
      const live = await runArcNoTty(["view", "spec", "--for", slug], cwd);
      expect(live.exitCode, live.stderr).toBe(0);
      expect(live.stdout).toContain("# Uncommitted live copy");
      expect(live.stdout).not.toContain("Base backlog copy");
      const liveDesign = await runArcNoTty(["view", "design", "--for", slug], cwd);
      expect(liveDesign.exitCode, liveDesign.stderr).toBe(0);
      expect(liveDesign.stdout).toContain("# Uncommitted live copy");
      const path = await runArcNoTty(["view", "spec", "--for", slug, "--path"], cwd);
      expect(path).toEqual({ stdout: `${specPath}\n`, stderr: "", exitCode: 0 });
      expect(live.stdout).toContain(await readFile(path.stdout.trim(), "utf8"));
      await git(cwd, ["worktree", "remove", "--force", checkout]);
      const atRef = await runArcNoTty(["view", "spec", "--for", slug], cwd);
      expect(atRef.exitCode, atRef.stderr).toBe(0);
      expect(atRef.stdout).toContain("# Started branch copy");
      expect(atRef.stdout).not.toContain("Base backlog copy");
      const refDesign = await runArcNoTty(["view", "design", "--for", slug], cwd);
      expect(refDesign.exitCode, refDesign.stderr).toBe(0);
      expect(refDesign.stdout).toContain("# Started branch copy");
      const refused = await runArcNoTty(["view", "spec", "--for", slug, "--path"], cwd);
      expect(refused).toMatchObject({ stdout: "", exitCode: 1 });
      expect(refused.stderr).toContain(slug);
      expect(refused.stderr).toContain(branch);
      expect(refused.stderr).toContain(`arc view spec --for ${slug}`);
    } finally {
      await git(cwd, ["worktree", "remove", "--force", checkout]).catch(() => undefined);
    }
  }, 30_000);

  it("rejects --for with the shared project inbox", async () => {
    const result = await runArcNoTty(["view", "inbox", "--project", "--for", "feature"], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("identity-global");
  });

  it("applies the user-scoped clock to non-TTY headers and surfaces invalid overrides", async () => {
    await writePresentationMeta(cwd);
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
    await writePresentationMeta(cwd);
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
    await writePresentationMeta(cwd);
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
      await writePresentationMeta(cwd);
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
        .toBe("--version\nLESS=FRK +/###.*1\\.1\n--pager --width 0 -\n");
    },
  );

  it.runIf(process.platform === "linux")(
    "opens an anchor-capable pager at the shifted current-task line",
    async () => {
      await writePresentationMeta(cwd);
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
      expect(log).toContain("BAT_PAGER=less -RFK +4");
      expect(log).toContain("--paging=always --style=plain --language=md");
    },
  );

  it.runIf(process.platform === "linux")(
    "prints the artifact path under --path without rendering, even under a TTY",
    async () => {
      await writePresentationMeta(cwd);
      const { binDir, logPath } = await installFakeGlow(cwd);
      const result = await runArc(["view", "tasks", "--path"], cwd, {
        env: {
          CI: "false",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          ARC_VIEW_RENDER_LOG: logPath,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toMatch(/^\/.*\/\.arc\/active\/tasks-feature\.md\r?\n$/u);
      await expect(access(logPath)).rejects.toThrow();
    },
  );

  it("fails --path for an absent artifact and refuses --path with --current", async () => {
    await writePresentationMeta(cwd);
    const absent = await runArcNoTty(["view", "spec", "--path"], cwd);
    expect(absent.exitCode).toBe(1);
    expect(absent.stdout).toBe("");
    expect(absent.stderr).toContain("spec is not present.");

    const current = await runArcNoTty(["view", "tasks", "--current", "--path"], cwd);
    expect(current.exitCode).toBe(1);
    expect(current.stdout).toBe("");
    expect(current.stderr).toContain("--path cannot be combined with --current");
  });

  it("does not probe or spawn a renderer under non-TTY", async () => {
    await writePresentationMeta(cwd);
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
    await writePresentationMeta(cwd);
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

  it.each(["--editor", "-e"])("recognizes %s and refuses noninteractive handoff", async (flag) => {
    const result = await runArcNoTty(["view", flag], cwd, { env: { ARC_EDITOR: "editor-must-not-run" } });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--editor requires an interactive terminal");
  });

  it.each(["--path", "--current"])("refuses editor with %s before resolution", async (destination) => {
    const result = await runArcNoTty(["view", "--editor", destination], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`--editor cannot be combined with ${destination}`);
  });

  it.runIf(process.platform === "linux").each([
    { args: ["--no-input", "view", "--editor"], ci: "false" },
    { args: ["view", "--editor"], ci: "true" },
  ])("refuses interaction policy $args with CI=$ci even under a TTY", async ({ args, ci }) => {
    const result = await runArc(args, cwd, { env: { CI: ci, ARC_EDITOR: "editor-must-not-run" } });
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("--editor requires an interactive terminal");
    expect(`${result.stdout}${result.stderr}`).not.toContain("editor-must-not-run");
  });

  it("refuses editor when stdin is piped", async () => {
    const result = await runArcWithStdin(["view", "--editor"], cwd, "ignored\n");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--editor requires an interactive terminal");
  });

  it.runIf(process.platform === "linux")("refuses editor when only stdout is piped", async () => {
    const result = await runArcWithStdoutPipe(["view", "--editor"], cwd);
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("--editor requires an interactive terminal");
  });

  it.runIf(process.platform === "linux")("hands off the real file with inherited streams and no presentation", async () => {
    const { command, logPath } = await installFakeEditor(cwd);
    const { binDir, logPath: rendererLog } = await installFakeGlow(cwd);
    await git(cwd, ["config", "arc.viewClock", "invalid-clock"]);
    const before = await readFile(join(cwd, ".arc/active/tasks-feature.md"), "utf8");
    const result = await runArc(["view", "-e"], cwd, {
      env: {
        CI: "false", ARC_EDITOR: `${command} --wait`, ARC_TEST_EDITOR_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH ?? ""}`, ARC_VIEW_RENDER_LOG: rendererLog,
      },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(JSON.parse(await readFile(logPath, "utf8"))).toEqual({
      args: ["--wait", join(cwd, ".arc/active/tasks-feature.md")], body: before,
      stdinTTY: true, stdoutTTY: true,
    });
    expect(await readFile(join(cwd, ".arc/active/tasks-feature.md"), "utf8")).toBe(before);
    await expect(access(rendererLog)).rejects.toThrow();
  });

  it.runIf(process.platform === "linux").each(["tasks", "spec", "draft", "meta"])(
    "preserves bare %s fallback for editor and path destinations", async (selectedKind) => {
    const { command, logPath } = await installFakeEditor(cwd);
    const env = { CI: "false", ARC_EDITOR: command, ARC_TEST_EDITOR_LOG: logPath };
    await writeFile(join(cwd, ".arc/active/spec-feature.md"), "# Spec\n");
    await writeFile(join(cwd, ".arc/active/draft-feature.md"), "# Draft\n");
    for (const kind of ["tasks", "spec", "draft", "meta"]) {
      if (kind === selectedKind) break;
      await rm(join(cwd, `.arc/active/${kind}-feature.md`));
    }
    const pathResult = await runArcNoTty(["view", "--path"], cwd);
    expect(pathResult.stdout.trim()).toBe(join(cwd, `.arc/active/${selectedKind}-feature.md`));
    const result = await runArc(["view", "--editor"], cwd, { env });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const record = JSON.parse(await readFile(logPath, "utf8")) as { args: string[]; body: string };
    expect(record.args).toEqual([pathResult.stdout.trim()]);
    expect(record.body).toBe(await readFile(pathResult.stdout.trim(), "utf8"));
  });

  it.runIf(process.platform === "linux")("delegates empty ARC_EDITOR to Git and retries failed commands", async () => {
    const { command, logPath } = await installFakeEditor(cwd);
    vi.stubEnv("GIT_EDITOR", undefined);
    await git(cwd, ["config", "core.editor", `${command} --wait`]);
    const env = { CI: "false", ARC_EDITOR: "", ARC_TEST_EDITOR_LOG: logPath };
    const selected = await runArc(["view", "--editor"], cwd, { env });
    expect(selected).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const failed = await runArc(["view", "--editor"], cwd, {
      env: { ...env, ARC_EDITOR: `${command} --wait`, ARC_TEST_EDITOR_EXIT: "7" },
    });
    expect(failed.exitCode).toBe(1);
    expect(`${failed.stdout}${failed.stderr}`).toContain("ARC_EDITOR");
    const repaired = await runArc(["view", "--editor"], cwd, { env: { ...env, ARC_EDITOR: command } });
    expect(repaired).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it.runIf(process.platform === "linux").each([
    ["meta", "--for", "feature"], ["tasks", "--for", "feature"], ["spec", "--for", "feature"],
    ["draft"], ["notes"], ["session-notes"], ["working-memory"], ["inbox"], ["inbox", "--project"],
  ])("opens the same explicit file as path output for %j", async (...selectors) => {
    const { command, logPath } = await installFakeEditor(cwd);
    await git(cwd, ["config", "arc.identity", "andrew"]);
    for (const kind of ["spec", "draft", "notes"]) {
      await writeFile(join(cwd, `.arc/active/${kind}-feature.md`), `# ${kind}\n`);
    }
    const userRoot = join(cwd, ".arc/user/andrew");
    await mkdir(join(userRoot, "feature"), { recursive: true });
    await writeFile(join(userRoot, "feature/SESSION-NOTES.md"), "# Session Notes\n");
    await writeFile(join(userRoot, "WORKING-MEMORY.md"), "# Working Memory\n");
    await writeFile(join(userRoot, "USER-INBOX.md"), "# Inbox\n");
    await mkdir(join(cwd, ".arc/backlog"), { recursive: true });
    await writeFile(join(cwd, ".arc/backlog/ATOMIC-INBOX.md"), "# Shared Inbox\n");
    const pathResult = await runArcNoTty(["view", ...selectors, "--path"], cwd);
    expect(pathResult.exitCode).toBe(0);
    const result = await runArc(["view", ...selectors, "--editor"], cwd, {
      env: { CI: "false", ARC_EDITOR: command, ARC_TEST_EDITOR_LOG: logPath },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const record = JSON.parse(await readFile(logPath, "utf8")) as { args: string[]; body: string };
    expect(record.args).toEqual([pathResult.stdout.trim()]);
    expect(record.body).toBe(await readFile(pathResult.stdout.trim(), "utf8"));
  });

  it.runIf(process.platform === "linux")("fails a missing artifact without handing off to the editor", async () => {
    const { command, logPath } = await installFakeEditor(cwd);
    const result = await runArc(["view", "notes", "--editor"], cwd, {
      env: { CI: "false", ARC_EDITOR: command, ARC_TEST_EDITOR_LOG: logPath },
    });
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("notes is not present");
    await expect(access(logPath)).rejects.toThrow();
  });
});

async function installFakeEditor(cwd: string): Promise<{ command: string; logPath: string }> {
  const { binDir, logPath: rendererLog } = await installFakeGlow(cwd);
  vi.stubEnv("PATH", `${binDir}:${process.env.PATH ?? ""}`);
  vi.stubEnv("ARC_VIEW_RENDER_LOG", rendererLog);
  const scriptPath = join(cwd, "editor recorder.cjs");
  const logPath = join(cwd, "editor.json");
  await writeFile(scriptPath, [
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    "fs.writeFileSync(process.env.ARC_TEST_EDITOR_LOG, JSON.stringify({",
    "  args, body: fs.readFileSync(args.at(-1), 'utf8'),",
    "  stdinTTY: process.stdin.isTTY, stdoutTTY: process.stdout.isTTY,",
    "}));",
    "process.exit(Number(process.env.ARC_TEST_EDITOR_EXIT || 0));",
  ].join("\n"));
  return { command: `'${process.execPath}' '${scriptPath}'`, logPath };
}

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
