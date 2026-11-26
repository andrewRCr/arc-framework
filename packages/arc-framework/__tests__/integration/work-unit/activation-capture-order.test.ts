import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { expect, it } from "vitest";
import { InboxResultSchema } from "../../../src/lib/inbox/types.js";
import { git } from "../../e2e/helpers.js";
import { useInRepoStore } from "../../helpers/in-repo-store-override.js";
import { readStoreRecord, seedStore } from "../../helpers/store/seed-store.js";
import { seedWorkUnit } from "../../helpers/store/seed-work-unit.js";
import { expectLifecycleResult, lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS } from "../../helpers/store-lifecycle-fixture.js";
import { personalInbox } from "../../helpers/store-locus-inbox-fixture.js";
import { readReadyProjection, retainLateEdit, workflowSaveBlocked } from "../../helpers/workflow-save-gate.js";

function preconditions(workflow: string): string {
  return workflow.slice(workflow.indexOf("### 1)"), workflow.indexOf("### 2)"));
}

it("saves capture dispositions and folds before removing their sources", async () => {
  const workflow = await readFile(resolve(import.meta.dirname,
    "../../../arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const gate = preconditions(workflow);
  const notes = gate.search(/notes(?:-\{name\}\.md| companion)/u);
  const fold = gate.indexOf("fold");
  const save = gate.indexOf("arc save", notes);
  const status = gate.indexOf("arc status --json", save);
  const remove = gate.indexOf("arc user inbox-remove");

  expect(notes).toBeGreaterThanOrEqual(0);
  expect(fold).toBeGreaterThanOrEqual(0);
  expect(save).toBeGreaterThan(Math.max(notes, fold));
  expect(status, "Check acceptance after saving the disposition").toBeGreaterThan(save);
  expect(remove, "The source row must remain until its disposition is accepted").toBeGreaterThan(status);
  expect(gate.slice(0, save)).toMatch(/\bID\b[^.]*\bversion\b/iu);
  expect(gate).toMatch(/\b(?:retry|restart)\b[^.]*\bsaved\b/iu);
});

it.each(["retained aside edit", "rendered conflict"] as const)("retains the source capture for a %s", async condition => {
  const h = await lifecycleRepository();
  const pending = "Reason pending.";
  const original = `# Notes: Example\n\n${pending}\n`;
  const { records: [notes] } = await seedWorkUnit(h.repo, "example", {
    identity: LIFECYCLE_IDENTITY, bind: h.repo,
    meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "generate-tasks", design: ["spec-example.md"] },
    records: [
      { kind: "work-item/notes", content: original },
      { kind: "work-item/spec", content: "# Specification: Example\n" },
    ],
  });
  if (notes === undefined) throw new Error("Expected a seeded notes record");
  const inbox = await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, personalInbox);
  await seedStore(h.repo, LIFECYCLE_IDENTITY, [{ reference: inbox.reference, expected: inbox.version,
    content: "# User Inbox\n\n## Work Unit\n\n### **Survey concern**\n- WU_Target: example\n- _Id:_ `12345678`\n" }]);
  const list = async () => {
    const result = await h.run(["inbox", "personal", "--target", "example", "--json"]);
    expect(result.exitCode, result.output).toBe(0);
    return InboxResultSchema.parse(JSON.parse(result.stdout));
  };
  const listed = await list();
  if (listed.state !== "named" || listed.entries[0] === undefined) throw new Error("Expected a named capture");
  const { id, version } = listed.entries[0];
  const disposition = `Dismissed personal capture ${id} at ${version}: the survey already covers this.`;
  const meta = await h.run(["view", "meta", "--path"]);
  expectLifecycleResult(meta, 0, /meta-example\.md/u);
  const path = join(dirname(meta.stdout.trim()), "notes-example.md");
  let repair: () => Promise<void>;
  if (condition === "retained aside edit") {
    repair = await retainLateEdit(h, path, disposition);
  } else {
    const projected = await readFile(path, "utf8");
    await seedStore(h.repo, LIFECYCLE_IDENTITY, [{ reference: notes.reference, expected: notes.version,
      content: original.replace(pending, "Reason under discussion.") }]);
    await writeFile(path, projected.replace(pending, disposition));
    const saved = await h.run(["save"]);
    expect(saved.exitCode, saved.output).toBe(0);
    const conflicted = await readFile(path, "utf8");
    const block = /^<{7,} .*\[arc-conflict: [^\n]*\n[\s\S]*?^>{7,} [^\n]*/mu;
    expect(conflicted.match(block)?.[0]).toContain(disposition);
    const { files } = await readReadyProjection(h);
    expect(files).not.toContainEqual(expect.objectContaining({ path: relative(h.repo, path).replaceAll("\\", "/") }));
    repair = async () => {
      await writeFile(path, conflicted.replace(block, disposition));
      const retry = await h.run(["save"]);
      expect(retry.exitCode, retry.output).toBe(0);
    };
  }
  const stored = () => readStoreRecord(h.repo, LIFECYCLE_IDENTITY, notes.reference);
  expect((await stored()).content).not.toContain(disposition);

  const workflow = await readFile(join(h.repo, ".arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const beforeRemove = preconditions(workflow).split("arc user inbox-remove")[0] ?? "";
  const remove = async (): Promise<void> => {
    if (await workflowSaveBlocked(h, beforeRemove, [path])) return;
    const result = await h.run(["user", "inbox-remove", "--id", id, "--expected-version", version]);
    expect(result.exitCode, result.output).toBe(0);
  };
  await remove();
  expect(await list()).toMatchObject({ state: "named", entries: [expect.objectContaining({ id, version })] });

  await repair();
  expect(await stored()).toMatchObject({ content: expect.stringContaining(disposition), conflicts: [] });
  await remove();
  expect(await list()).toMatchObject({ state: "clear", entries: [] });
}, LIFECYCLE_TIMEOUT_MS);

it("continues capture removal after the reported save remedy records the disposition", async () => {
  useInRepoStore();
  const h = await lifecycleRepository();
  const notes = ".arc/active/notes-example.md";
  const inbox = ".arc/user/test-user/USER-INBOX.md";
  const title = "Survey concern";
  const disposition = `Dismissed personal capture ${title}: the survey already covers this.`;
  await mkdir(dirname(join(h.repo, notes)), { recursive: true });
  await mkdir(dirname(join(h.repo, inbox)), { recursive: true });
  await writeFile(join(h.repo, notes), "# Notes: Example\n");
  await git(h.repo, ["add", "--", notes]);
  await git(h.repo, ["commit", "-m", "Create work unit notes"]);
  await writeFile(join(h.repo, notes), `# Notes: Example\n\n${disposition}\n`);
  await writeFile(join(h.repo, inbox), `# User Inbox\n\n## Work Unit\n\n### \`[ ]\` **${title}**\n\n- WU_Target: example\n`);
  const list = async () => {
    const result = await h.run(["user", "inbox-list", "--target", "example", "--json"]);
    expect(result.exitCode, result.output).toBe(0);
    return JSON.parse(result.stdout);
  };
  expect(await list()).toMatchObject({ state: "named", entries: [expect.objectContaining({ title })] });

  const saved = await h.run(["save", "--json"]);
  expect(saved.exitCode, saved.output).toBe(1);
  expect(JSON.parse(saved.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported",
    condition: expect.stringContaining("storage backend"), remedy: { text: expect.stringContaining("git commit") } } });
  expect(await git(h.repo, ["show", `HEAD:${notes}`])).not.toContain(disposition);
  expect(await list()).toMatchObject({ state: "named" });

  const workflow = await readFile(join(h.repo, ".arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const gate = preconditions(workflow).split("arc user inbox-remove")[0] ?? "";
  if (/`arc save` refuses,[^.]*\b(?:surface|report)\b[^.]*\bcondition\b[^.]*\bremedy\b[^.]*\bcontinue\b/iu.test(gate)) {
    await git(h.repo, ["add", "--", notes]);
    await git(h.repo, ["commit", "-m", "Record capture disposition"]);
    expect(await git(h.repo, ["show", `HEAD:${notes}`])).toContain(disposition);

    const operand = join(h.repo, "capture-title.txt");
    await writeFile(operand, `${title}\n`);
    const removed = await h.run(["user", "inbox-remove", "--inbox-title-file", operand]);
    expect(removed.exitCode, removed.output).toBe(0);
  }
  expect(await list(), "The saved disposition lets the capture gate finish after the remedy").toMatchObject({ state: "clear" });
}, LIFECYCLE_TIMEOUT_MS);
