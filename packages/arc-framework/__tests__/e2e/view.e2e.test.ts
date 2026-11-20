/**
 * End-to-end tests for the non-TTY `arc view` contract.
 */

import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import type { KindId } from "../../src/lib/store/catalog.js";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { readProjectIdentityBinding } from "../../src/lib/store/project-identity.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, type RecordReference } from
  "../../src/lib/store/identity.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { readStoreRecord, removeStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcNoTty,
  runArcWithStdoutPipe,
  runArcWithStdin,
} from "./store-default.js";

const IDENTITY = SlugSchema.parse("test-user");
const FEATURE = OwnerIdentitySchema.parse({ type: "work-item", name: "feature" });
const PERSON = OwnerIdentitySchema.parse({ type: "person", name: "test-user" });

/** A work unit's meta holding no task list, Planning and with no branch unless the overrides say otherwise. */
function listlessMeta(slug: string, overrides: Parameters<typeof makeMetaFixture>[1] = {}): string {
  return makeMetaFixture(slug, { state: "Planning", owner: "test-user", branch: null, taskList: null, ...overrides });
}

/** The bound work unit's meta, as the store holds it. */
const FEATURE_META = makeMetaFixture("feature", {
  owner: "test-user", branch: "main", taskList: "tasks-feature.md", nextAction: "Continue implementation",
});

/** The same meta as a tracked file, which the in-repo store reads without validating its unset fields. */
const TRACKED_FEATURE_META = [
  "# Metadata: feature",
  "",
  "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
  "| --------- | --------- | ---------- | --------- | ------------ |",
  "| Active | — | main | — | — |",
  "",
  "- **Task List:** tasks-feature.md",
  "- **Next Action:** Continue implementation",
  "",
  "---",
  "",
].join("\n");

const FEATURE_TASKS = [
  "# Task List: feature",
  "",
  "## **Phase 1:** Build",
  "",
  "### `[ ]` **1.1 First task**",
  "",
  "- _Goal:_ Complete the first task.",
  "",
].join("\n");

/** The work unit's record of one kind. */
function featureRecord(kind: KindId): RecordReference {
  return RecordReferenceSchema.parse({ kind, owner: FEATURE });
}

/** The project's shared inbox, a record of the project `arc init` minted. */
async function projectInbox(cwd: string): Promise<RecordReference> {
  const project = await readProjectIdentityBinding(selectStore(createDefaultStorePorts({ checkoutRoot: cwd }), {}));
  return recordReferences["project-inbox/inbox"](project.owner);
}

/** Hold one record in the store, replacing the version it holds when it holds one. */
async function hold(cwd: string, reference: RecordReference, content: string): Promise<void> {
  const held = await readStoreRecord(cwd, IDENTITY, reference).catch(() => null);
  await seedStore(cwd, IDENTITY, [{ reference: held?.reference ?? reference, content,
    ...(held === null ? {} : { expected: held.version }),
    ...(reference.kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}) }]);
}

/** The path the store projects one of the bound work unit's artifacts to in this checkout. */
function projected(cwd: string, kind: string): string {
  return join(cwd, ".arc", "active", "current", `${kind}-feature.md`);
}

describe("arc view", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempRepo("arc-view-e2e-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "view", "--identity", "test-user", "--tools", ""], cwd);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "chore: initialize view fixture"]);
    // The store holds the work unit and its task list, bound to this checkout, as starting it here leaves them.
    await seedWorkUnit(cwd, "feature", {
      identity: "test-user", content: FEATURE_META, taskList: FEATURE_TASKS, branch: "main", bind: cwd,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(cwd);
  });

  it("writes the plain artifact body with no ANSI decoration", async () => {
    const result = await runArcNoTty(["view"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^Phase 1\/1 · Task 1\.1 · 0\/1 overall · rendered \d{2}:\d{2}/u);
    expect(result.stdout).toContain("# Task List: feature");
    expect(result.stdout).not.toContain("\u001b[");
  });

  it("uses conventional task fallback and bare lifecycle selection", async () => {
    await hold(cwd, featureRecord("work-item/meta"), listlessMeta("feature", { state: "Active", branch: "main" }));
    const forming = await runArcNoTty(["view"], cwd);
    expect(forming.stdout).toContain("# Task List: feature");

    await removeStoreRecord(cwd, IDENTITY, featureRecord("work-item/task-list"));
    await hold(cwd, featureRecord("work-item/spec"), "# Forming spec\n");
    const spec = await runArcNoTty(["view"], cwd);
    // View presents the projected file, whose base stamp is one line of it.
    expect(spec.stdout).toMatch(/^spec · feature · 2 lines · rendered /u);
    expect(spec.stdout).toContain("# Forming spec");
  });

  it("resolves explicit targets and fails closed on misses", async () => {
    await seedWorkUnit(cwd, "planned", { identity: "test-user", content: listlessMeta("planned"),
      placement: { kind: "backlog", commitment: "planned" }, records: [{ kind: "work-item/spec", content: "# Planned spec\n" }] });
    await seedWorkUnit(cwd, "provisional", { identity: "test-user", content: listlessMeta("provisional"),
      placement: { kind: "backlog", commitment: "provisional" } });
    await seedWorkUnit(cwd, "completed", { identity: "test-user",
      content: listlessMeta("completed", { state: "Shipped", branch: "feat/completed", completed: "2026-07-14" }),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") } });

    const active = await runArcNoTty(["view", "meta", "--for", "feature"], cwd);
    expect(active.exitCode).toBe(0);
    expect(active.stdout).toContain("meta · feature");

    const resolved = await runArcNoTty(["view", "spec", "--for", "planned"], cwd);
    expect(resolved.exitCode).toBe(0);
    expect(resolved.stdout).toContain("spec · planned · 2 lines");
    expect(resolved.stdout).toContain("# Planned spec");

    const provisionalResult = await runArcNoTty(["view", "meta", "--for", "provisional"], cwd);
    expect(provisionalResult.exitCode).toBe(0);
    expect(provisionalResult.stdout).toContain("meta · provisional");

    // The store opens a completed work unit's meta as it does any other's.
    const completedResult = await runArcNoTty(["view", "meta", "--for", "completed"], cwd);
    expect(completedResult.exitCode, completedResult.stderr).toBe(0);
    expect(completedResult.stdout).toContain("meta · completed");

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

  it("rejects --for with the shared project inbox", async () => {
    const result = await runArcNoTty(["view", "inbox", "--project", "--for", "feature"], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("identity-global");
  });

  it("applies the user-scoped clock to non-TTY headers and surfaces invalid overrides", async () => {
    await hold(cwd, featureRecord("work-item/spec"), "# Spec\n");
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

  it("emits the bare current-task region and the state with no open task", async () => {
    const current = await runArcNoTty(["view", "tasks", "--current"], cwd);
    expect(current).toEqual({
      stdout: "### `[ ]` **1.1 First task**\n\n- _Goal:_ Complete the first task.\n",
      stderr: "",
      exitCode: 0,
    });

    await hold(cwd, featureRecord("work-item/task-list"), FEATURE_TASKS.replace("`[ ]`", "`[x]`"));
    const terminal = await runArcNoTty(["view", "tasks", "--current"], cwd);
    expect(terminal).toEqual({ stdout: "No open task.\n", stderr: "", exitCode: 0 });
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
        .toBe("--version\nLESS=FRK +/###.*1\\.1\n--pager --width 0 -\n");
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
      // The projected file's base stamp sits above the task list, one line further down.
      expect(log).toContain("BAT_PAGER=less -RFK +5");
      expect(log).toContain("--paging=always --style=plain --language=md");
    },
  );

  it.runIf(process.platform === "linux")(
    "prints the artifact path under --path without rendering, even under a TTY",
    async () => {
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
      expect([`${projected(cwd, "tasks")}\n`, `${projected(cwd, "tasks")}\r\n`]).toContain(result.stdout);
      await expect(access(logPath)).rejects.toThrow();
    },
  );

  it("fails --path for an absent artifact and refuses --path with --current", async () => {
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
    const result = await runArc(["view", "-e"], cwd, {
      env: {
        CI: "false", ARC_EDITOR: `${command} --wait`, ARC_TEST_EDITOR_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH ?? ""}`, ARC_VIEW_RENDER_LOG: rendererLog,
      },
    });
    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    const handed = JSON.parse(await readFile(logPath, "utf8")) as { body: string };
    expect(handed).toEqual({
      args: ["--wait", projected(cwd, "tasks")], body: await readFile(projected(cwd, "tasks"), "utf8"),
      stdinTTY: true, stdoutTTY: true,
    });
    // The editor receives the projected file, the stored task list under its base stamp.
    expect(parseStampedFile(handed.body).content).toBe(FEATURE_TASKS);
    await expect(access(rendererLog)).rejects.toThrow();
  });

  it.runIf(process.platform === "linux").each(["tasks", "spec", "draft", "meta"])(
    "preserves bare %s fallback for editor and path destinations", async (selectedKind) => {
    const { command, logPath } = await installFakeEditor(cwd);
    const env = { CI: "false", ARC_EDITOR: command, ARC_TEST_EDITOR_LOG: logPath };
    await hold(cwd, featureRecord("work-item/spec"), "# Spec\n");
    await hold(cwd, featureRecord("work-item/draft"), "# Draft\n");
    const kinds = { tasks: "work-item/task-list", spec: "work-item/spec", draft: "work-item/draft" } as const;
    for (const kind of ["tasks", "spec", "draft"] as const) {
      if (kind === selectedKind) break;
      await removeStoreRecord(cwd, IDENTITY, featureRecord(kinds[kind]));
    }
    const pathResult = await runArcNoTty(["view", "--path"], cwd);
    expect(pathResult.stdout.trim()).toBe(projected(cwd, selectedKind));
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
    for (const kind of ["spec", "draft", "notes"] as const) {
      await hold(cwd, featureRecord(`work-item/${kind}`), `# ${kind}\n`);
    }
    // The store holds the work unit's session context in its meta, and the identity's and project's documents as
    // records of their own.
    await hold(cwd, recordReferences["personal/working-memory"](PERSON), "# Working Memory\n");
    await hold(cwd, recordReferences["personal/inbox"](PERSON), "# Inbox\n");
    await hold(cwd, await projectInbox(cwd), "# Shared Inbox\n");
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

describe("arc view over the in-repo store", () => {
  // A started sibling's uncommitted checkout copy, then its branch tip, read in place of the base backlog copy are the
  // in-repo store's, as is a malformed task list: the store holds one record for the work unit wherever it is bound,
  // and validates a task list before it holds one.
  useInRepoStoreForEach();
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempRepo("arc-view-e2e-");
    await mkdir(join(cwd, ".arc", "active"), { recursive: true });
    await writeFile(join(cwd, ".arc", "active", "meta-feature.md"), TRACKED_FEATURE_META);
    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"), FEATURE_TASKS);
  });

  afterEach(async () => {
    await cleanupTempDir(cwd);
  });

  it("degrades a malformed task list explicitly", async () => {
    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"), "### `[x]` **1.1 Complete**\n");
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
