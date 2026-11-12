/** Compacted notes retain workspace data when their annotated commits lack readable dates. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { compactNotesRefSnapshot } from "../../src/lib/user-sync/compaction.js";
import { listNoteEntries } from "../../src/lib/user-sync/notes-ref.js";
import { makeUserIO } from "../helpers/integration.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const fullRef = "refs/notes/arc/user/andrew";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
  key: "scratch/work-unit/alpha/memo.md" });

async function annotatedCommit(h: Awaited<ReturnType<typeof importFixture>>, name: string): Promise<string> {
  return (await h.git("git", ["commit-tree", "HEAD^{tree}", "-m", name])).stdout.trim();
}

async function compact(h: Awaited<ReturnType<typeof importFixture>>, versions: { annotated: string; files: Record<string, string> }[]): Promise<void> {
  const io = makeUserIO(h.root), pruned = await annotatedCommit(h, "Pruned note");
  for (const version of versions) await io.writeNote(fullRef, JSON.stringify({ version: 2, files: version.files }), version.annotated);
  await io.writeNote(fullRef, JSON.stringify({ version: 2, files: { "gone/old.md": "Pruned.\n" } }), pruned);
  await h.git("git", ["push", "origin", fullRef]);
  const notes = await listNoteEntries(h.git, fullRef);
  expect(await compactNotesRefSnapshot({ exec: io.exec, execInput: h.ports.execInput, fullRef,
    retained: notes.filter(note => note.commit !== pruned), pruned: notes.filter(note => note.commit === pruned) }))
    .toMatchObject({ kind: "compacted" });
  expect((await h.git("git", ["rev-list", "--count", fullRef])).stdout.trim()).toBe("1");
}

it.each(["unreadable", "without a committer date"] as const)("imports retained notes whose annotated commit is %s", async problem => {
  const h = await importFixture(), readable = await annotatedCommit(h, "Readable annotation");
  const tree = (await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  const annotated = problem === "unreadable" ? await annotatedCommit(h, "Unreadable annotation") :
    (await h.ports.execInput(["hash-object", "--literally", "-t", "commit", "-w", "--stdin"],
      `tree ${tree}\nauthor Fixture <fixture@example.com> 1700000000 +0000\n\nNo committer date.\n`, { cwd: h.root })).trim();
  await compact(h, [{ annotated: readable, files: {} }, { annotated, files: { "alpha/memo.md": "Retained workspace.\n" } }]);
  if (problem === "unreadable") await removeLooseObject(h.root, annotated);
  await mkdir(join(h.root, ".arc/user/andrew/alpha"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/alpha/memo.md"), "Retained workspace.\n");
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { refused: [], differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(annotated) }),
  ]) } });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Retained workspace.\n");
}, 40_000);

it.each([{ selection: "object ID order", readable: false }, { selection: "readable date precedence", readable: true }])(
  "selects workspace data by $selection after unreadable annotations", async ({ readable }) => {
    const h = await importFixture(), first = await annotatedCommit(h, "First retained"), second = await annotatedCommit(h, "Second retained");
    const versions = [{ annotated: first, files: { "alpha/memo.md": "First retained.\n" } },
      { annotated: second, files: { "alpha/memo.md": "Second retained.\n" } }];
    if (readable) versions.push({ annotated: await annotatedCommit(h, "Readable retained"), files: { "alpha/memo.md": "Readable retained.\n" } });
    await compact(h, versions);
    await removeLooseObject(h.root, first);
    await removeLooseObject(h.root, second);
    const expected = readable ? "Readable retained.\n" : first < second ? "First retained.\n" : "Second retained.\n";
    await mkdir(join(h.root, ".arc/user/andrew/alpha"), { recursive: true });
    await writeFile(join(h.root, ".arc/user/andrew/alpha/memo.md"), expected);
    expect(await h.migrate()).toMatchObject({ status: "ok", result: { refused: [], differingNotes: [], notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining(first) }),
      expect.objectContaining({ condition: expect.stringContaining(second) }),
    ]) } });
    expect(success(await createRefStore(h.ports).read({ reference })).content).toBe(expected);
  }, 40_000);
