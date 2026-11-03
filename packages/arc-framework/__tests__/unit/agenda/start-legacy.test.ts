/** Legacy Start uses the same local selection as status and checks quality before state. */
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { activeSessionInit, configSessionInit, userSessionInit, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { resolveLifecycleSubject } from "../../../src/lib/store/lifecycle-subject.js";
import { resolveAgendaStartTarget } from "../../../src/commands/agenda/start-target.js";
import { createAgendaReadPort } from "../../../src/commands/agenda/compile-input.js";

async function fixture(indeterminate: boolean, probes: SessionInitProbeOverrides = {}) {
    const cwd = await mkdtemp(join(tmpdir(), "arc-start-legacy-"));
    onTestFinished(() => rm(cwd, { recursive: true, force: true }));
    const directory = join(cwd, ".arc/backlog/planned/target");
    await mkdir(directory, { recursive: true });
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch:\n  base: main\n");
    await writeFile(join(directory, "meta-target.md"), makeMetaFixture("target", { state: "Planning", currentWorkflow: null }));
    const exec = scriptGitExec([
      { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: indeterminate ? `refs/remotes/origin/feat/target\t${"e".repeat(40)}` : "" }] },
      { match: { prefix: ["worktree"] }, responses: [{ stdout: "" }] },
      { match: { prefix: ["ls-tree"] }, responses: [{ failure: { exitCode: 128, stderr: "meta enumeration failed" } }] },
    ]).exec;
    const { input } = await createSignalAgendaFixture(undefined, probes, false);
    input.entry = { ...input.entry, cwd, identity: null, io: { ...input.entry.io, exec } };
    input.read.read = path => readFile(path, "utf8");
    return { input, cwd, exec, directory };
}

describe("legacy local Start evidence", () => {
  it.each([false, true])("retains planned status evidence with indeterminate=%s", async indeterminate => {
    const { input, cwd, exec, directory } = await fixture(indeterminate);
    const selected = await resolveLifecycleSubject({ cwd, identity: null, exec }, "target");
    expect(selected).toMatchObject({ status: "ok", result: { backend: "legacy", query: { state: "planned" } } });
    const target = await resolveAgendaStartTarget(input, "target");
    if (indeterminate) {
      expect(selected).toMatchObject({ status: "ok", result: { composed: { qualityFacts: { resultMarks: ["indeterminate"],
        warnings: [expect.objectContaining({ code: "meta-enumeration-failed" })] } } } });
      expect(target).toMatchObject({ kind: "unresolved", reason: expect.stringContaining("Unable to enumerate active metas") });
    } else expect(target).toMatchObject({ kind: "resolved", slug: "target", metaPath: join(directory, "meta-target.md"), taskListPath: null });
  });
});

it("reads real legacy target files before readiness without store arguments", async () => {
  const { input, cwd, exec, directory } = await fixture(false);
  const metaPath = join(directory, "meta-target.md"), taskListPath = join(directory, "tasks-target.md");
  await writeFile(metaPath, makeMetaFixture("target", { state: "Planning", currentWorkflow: null, taskList: "tasks-target.md" }));
  await writeFile(taskListPath, "# Tasks\n\n## **Phase 1:** Build\n\n### `[ ]` **1.1 Build**\n");
  input.read = createAgendaReadPort(cwd, exec);
  input.signals = { start: "target" };
  const result = await compileSessionInitAgenda(input);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  expect(result.agenda.steps.filter(step => step.type === "read")).toEqual(expect.arrayContaining([
    { type: "read", path: metaPath, readMode: { kind: "full" }, group: expect.any(Number) },
    { type: "read", path: taskListPath, readMode: { kind: "full" }, group: expect.any(Number) },
  ]));
  expect(result.agenda.steps.at(-2)).toEqual({ type: "fragment", target: { kind: "method", name: "assess-start-readiness" },
    args: { slug: "target", metaPath, taskListPath } });
});


it("withholds next auto-proceed when a failed Start target precedes an otherwise clean resume", async () => {
  const { input } = await fixture(false, { active: async () => activeSessionInit({ resolution: "single",
    path: ".arc/active/meta-work.md", sessionType: "execution" }) });
  input.read.read = async path => path.endsWith("SESSION-NOTES.md") ? "**Commit at Handoff:** aaaaaaa\n" : makeMetaFixture("work");
  input.read.git = async () => "a".repeat(40);
  input.signals = { next: true };
  const ordinary = await compileSessionInitAgenda(input);
  expect(ordinary).toMatchObject({ ok: true, agenda: { steps: expect.arrayContaining([{ type: "gate", kind: "proceed", autoProceed: true }]) } });
  input.signals = { start: "missing", next: true };
  const failedStart = await compileSessionInitAgenda(input);
  expect(failedStart).toMatchObject({ ok: true, agenda: { steps: expect.arrayContaining([
    { type: "note", surface: "start-target", text: "Target 'missing' is nonexistent." },
    { type: "gate", kind: "proceed", autoProceed: false },
  ]) } });
});


it.each(["manual", "always"] as const)("carries the notes channel under %s Start policy", async policy => {
  const config = configSessionInit(); config.settings["session.init_pull.notes"] = policy;
  const { input } = await fixture(false, { config: async () => config,
    user: async () => userSessionInit({ identity: "test-user", state: "remote-ahead", shouldPromptToPull: true }) });
  input.signals = { start: "target" };
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error("Expected Start agenda");
  if (policy === "always") {
    expect(result.agenda.steps).toEqual([expect.objectContaining({ type: "exec", id: "notes:pull", actions: [{ text: "arc user pull", argv: ["arc", "user", "pull"] }] })]);
  } else {
    expect(result.agenda.steps).toContainEqual(expect.objectContaining({ type: "render", surface: "notes-behind" }));
    expect(result.agenda.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
  }
});
