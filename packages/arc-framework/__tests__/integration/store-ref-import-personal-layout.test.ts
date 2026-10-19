/** Personal import folds owned session prose and moves other files into scratch. */
import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { runUserSave, runUserLoad } from "../../src/commands/user.js";
import { makeUserIO } from "../helpers/integration.js";
import { createRefStore, createStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";

const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const handoff = "a".repeat(40);
const notes = `# Session Notes\n\n> Personal context for this work unit.\n\nKeep this leading prose.\n\n<!-- Drop this comment. -->\n\n## Handoff Metadata\n\n**Working On:** meta-alpha.md\n\n**Commit at Handoff:** \`${handoff}\`\n\n**Session Type:** Execution\n\n## Uncommitted Work\n\nKeep the unfinished implementation.\n\n## Additional Context\n\nKeep these observations.\n\n---\n`;
async function put(root: string, path: string, content: string, person = "andrew"): Promise<void> {
  const target = join(root, ".arc/user", person, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
async function meta(h: Awaited<ReturnType<typeof importFixture>>, name: string, content: string): Promise<void> {
  await writeFile(join(h.root, `.arc/active/meta-${name}.md`), content);
  await h.git("git", ["add", ".arc/active"]);
  await h.git("git", ["commit", "-m", "Prepare live personal context"]);
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", head]);
}

it("folds the owner's live session prose through the meta writer and retires obsolete handoff fields", async () => {
  const h = await importFixture();
  await meta(h, "alpha", makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha", nextTask: "Task 1.1", lastCompleted: "Task 1.0", blockers: "Wait for the dependency." }));
  await put(h.root, "alpha/SESSION-NOTES.md", notes);
  await saveImportPersonal(h.root);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports), record = success(await store.read({ reference })), fields = parseMetaRecord(record.content);
  expect(fields.sessionContext).toBe("Keep this leading prose.\n\n### Uncommitted Work\n\nKeep the unfinished implementation.\n\n### Additional Context\n\nKeep these observations.\n\n### Blockers\n\nWait for the dependency.");
  expect(fields).toMatchObject({ blockers: "Wait for the dependency.", commitAtHandoff: handoff, sessionType: "execution", nextTask: null, lastCompleted: null, stateAtHandoff: null });
  expect(record.content).not.toContain("Drop this comment");
  expect(record.content).not.toContain("**Next Task:**");
  expect(record.content).not.toContain("**Last Completed:**");
  expect(fields.sessionContext).not.toContain("Handoff Metadata");
  expect(fields.sessionContext).not.toContain("Working On");
  expect(fields.sessionContext).not.toContain("Personal context");
  expect(success(await store.list({ family: "personal", kind: "personal/session-context" }))).toMatchObject({ status: "absent" });
}, 40_000);


const contextNotes = "# Session Notes\n\n> Workspace context.\n\n## Continuity\n\nCarry this context.\n\n---\n";
const moved = [
  ["alpha/ADVERSARIAL-PASSES.md", "scratch/work-unit/alpha/ADVERSARIAL-PASSES.md", "Pass observations as written.\n"],
  ["archived/SESSION-NOTES.md", "scratch/work-unit/archived/SESSION-NOTES.md", contextNotes],
  ["archived/memo.txt", "scratch/work-unit/archived/memo.txt", "Ended workspace prose.\n"],
  ["drafts/idea.txt", "scratch/drafts/idea.txt", "Personal folder prose.\n"],
  ["scratch/already.md", "scratch/already.md", "Existing scratch prose.\n"],
  ["memo.txt", "scratch/memo.txt", "Root personal prose.\n"],
] as const;

describe.each(["default", "separate"] as const)("personal layout in %s", layout => {
  it("compares every person's independent source snapshot with its moved files and folded context", async () => {
    const h = await importComparisonFixture(layout, async fixture => {
      await meta(fixture, "beta", makeMetaFixture("beta", { owner: "alex", branch: null }));
      for (const person of ["andrew", "alex"]) {
        for (const [path, , content] of moved) await put(fixture.root, path, content, person);
        await put(fixture.root, "alpha/SESSION-NOTES.md", contextNotes.replace("Carry this context.", `Carry context for ${person}.`), person);
        await put(fixture.root, "beta/SESSION-NOTES.md", contextNotes.replace("Carry this context.", `Carry context for ${person}.`), person);
        await put(fixture.root, "USER-INBOX.md", "# Inbox\n\n## Errand\n", person);
        await put(fixture.root, "WORKING-MEMORY.md", "# Working Memory\n\n## Memories\n", person);
        await put(fixture.root, "STATUS.USER.md", "Generated status\0", person);
        await put(fixture.root, ".internal/checkpoint.json", "Machine-local\0", person);
        await put(fixture.root, "alpha/.internal/checkpoint.json", "Machine-local\0", person);
        const options = { cwd: fixture.root, io: makeUserIO(fixture.root), identity: person, currentWuName: "alpha" };
        await runUserSave(options);
        await runUserLoad(options);
        await runUserSave({ ...options, currentWuName: "beta" });
        await runUserLoad({ ...options, currentWuName: "beta" });
      }
    }, { completed: true });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    for (const person of ["andrew", "alex"]) {
      const source = createStore({ ...createDefaultStorePorts({ checkoutRoot: h.source.root }), identity: async () => SlugSchema.parse(person) });
      const before = success(await source.list({ family: "personal" }));
      expect(before.status).toBe("complete");
      if (before.status !== "complete") throw new Error("No personal comparison inventory");
      expect(before.records).toHaveLength(moved.length + 4);
      const expected = [];
      for (const record of before.records) {
        const owner = record.reference.owner;
        if (record.reference.kind === "personal/session-context" && record.reference.key === (person === "andrew" ? "alpha" : "beta")) {
          const actual = success(await h.store.read({ reference: RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: record.reference.key } }) }));
          expect(parseMetaRecord(actual.content).sessionContext).toBe(`### Continuity\n\nCarry context for ${person}.`);
          continue;
        }
        const original = record.reference.kind === "personal/session-context" ? `${String(record.reference.key)}/SESSION-NOTES.md` : record.reference.key;
        const path = original === "alpha/SESSION-NOTES.md" || original === "beta/SESSION-NOTES.md" ? `scratch/work-unit/${original}` : moved.find(([path]) => path === original)?.[1];
        const target = record.reference.kind === "personal/inbox" || record.reference.kind === "personal/working-memory" ? record.reference
          : RecordReferenceSchema.parse({ kind: "personal/document", owner, key: path });
        const after = await h.store.read({ reference: target });
        expect(after.status, String(original)).toBe("ok");
        expect(success(after).content).toBe(record.content);
        expected.push(JSON.stringify(target));
      }
      const after = success(await h.store.list({ family: "personal", owner: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: person } }).owner }));
      expect(after.status).toBe("complete");
      if (after.status === "complete") {
        expect(after.records.map(record => JSON.stringify(record.reference)).sort()).toEqual(expected.sort());
        expect(after.records.some(record => record.reference.kind === "personal/session-context")).toBe(false);
      }
    }
  }, 60_000);
});

it("transfers recognized session types, drops unknown values, and preserves metadata outside the fold", async () => {
  const h = await importFixture();
  const cases = [["beta", "Planning", "planning"], ["gamma", "standalone", null]] as const;
  for (const [name, sessionType] of cases) {
    const original = makeMetaFixture(name, { owner: "andrew", branch: null, nextTask: "Old task", lastCompleted: "Old completion", nextAction: "Keep the next action." }).replaceAll("\n", "\r\n");
    await meta(h, name, original);
    await put(h.root, `${name}/SESSION-NOTES.md`, notes.replace("Execution", sessionType).replace("meta-alpha", `meta-${name}`).replaceAll("\n", "\r\n"));
    const options = { cwd: h.root, io: makeUserIO(h.root), identity: "andrew", currentWuName: name };
    await runUserSave(options);
    await runUserLoad(options);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  for (const [name, , sessionType] of cases) {
    const record = success(await store.read({ reference: RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name } }) }));
    expect(parseMetaRecord(record.content)).toMatchObject({ sessionType, commitAtHandoff: handoff, blockers: null,
      nextTask: null, lastCompleted: null, stateAtHandoff: null, nextAction: "Keep the next action.",
      sessionContext: "Keep this leading prose.\n\n### Uncommitted Work\n\nKeep the unfinished implementation.\n\n### Additional Context\n\nKeep these observations.",
    });
    expect(record.content.replaceAll("\r\n", "")).not.toContain("\n");
    expect(record.content).not.toContain("State at Handoff");
  }
}, 40_000);

it("refuses interior session boundaries, lands nothing, and succeeds after a saved repair", async () => {
  const h = await importFixture();
  const broken = notes.replace("Keep the unfinished implementation.", "Keep the unfinished implementation.\n\n---\n\nThis is an interior rule.");
  await put(h.root, "alpha/SESSION-NOTES.md", broken);
  await saveImportPersonal(h.root);
  const result = await h.migrate(true);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("No trial report");
  expect(result.result.refused).toEqual([{ reference: RecordReferenceSchema.parse({ kind: "personal/session-context", owner: { type: "person", name: "andrew" }, key: "alpha" }), rule: "session-context" }]);
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  await put(h.root, "alpha/SESSION-NOTES.md", notes);
  await saveImportPersonal(h.root);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(parseMetaRecord(success(await createRefStore(h.ports).read({ reference })).content).sessionContext).toContain("Keep the unfinished implementation.");
}, 40_000);

it("refuses conflicting sources that move to one scratch path and carries their agreed content after repair", async () => {
  const h = await importFixture();
  await put(h.root, "alpha/memo.txt", "Live workspace bytes.\n");
  await put(h.root, "scratch/work-unit/alpha/memo.txt", "Different scratch bytes.\n");
  await saveImportPersonal(h.root);
  const result = await h.migrate(true);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("No trial report");
  const target = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/work-unit/alpha/memo.txt" });
  expect(result.result.refused).toEqual([{ reference: target, rule: "key" }]);
  expect(result.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("alpha/memo.txt"), remedy: expect.objectContaining({ text: expect.stringContaining("reconcile") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/"])).stdout).toBe("");
  await put(h.root, "scratch/work-unit/alpha/memo.txt", "Live workspace bytes.\n");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  expect(success(await store.read({ reference: target })).content).toBe("Live workspace bytes.\n");
  const listed = success(await store.list({ family: "personal", kind: "personal/document" }));
  expect(listed).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: target })] });
}, 40_000);
