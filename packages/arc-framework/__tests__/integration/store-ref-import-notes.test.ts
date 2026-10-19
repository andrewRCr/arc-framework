/** Import admits personal state only after notes and every materialized copy agree. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, readFile, writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compactNotesRefSnapshot } from "../../src/lib/user-sync/compaction.js";
import { listNoteEntries } from "../../src/lib/user-sync/notes-ref.js";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { importFixture } from "../helpers/store/import-fixture.js";
import { makeCommit, makeUserIO } from "../helpers/integration.js";
import { runUserSave, runUserLoad } from "../../src/commands/user.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import type { StoreMigrateResult, MigrateReport } from "../../src/lib/store/commands.js";
import { success } from "../helpers/store/suite-tools.js";

const inbox = (entries: string) => `# Inbox\n\n## Errand\n\n${entries}`;
const entry = (name: string) => `### **${name}**\n\n${name} prose.\n\n`;
async function put(root: string, path: string, content: string, person = "andrew"): Promise<void> {
  await mkdir(dirname(join(root, ".arc/user", person, path)), { recursive: true });
  await writeFile(join(root, ".arc/user", person, path), content);
}
async function reconcile(root: string, currentWuName = "alpha"): Promise<void> {
  const options = { cwd: root, io: makeUserIO(root), identity: "andrew", currentWuName };
  await runUserSave(options);
  await runUserLoad(options);
}
function personal(kind: "personal/inbox" | "personal/document", key?: string) {
  return RecordReferenceSchema.parse({ kind, owner: { type: "person", name: "andrew" }, ...(key ? { key } : {}) });
}

function trialReport(result: StoreMigrateResult): MigrateReport {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("The migration did not produce a trial report");
  return result.result;
}

it("reports a removed disk entry and restores older-note entries through save and load before landing", async () => {
  const h = await importFixture();
  const io = makeUserIO(h.root);
  // Valid independent note versions model saves from parallel materializations.
  await io.writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2, files: { "USER-INBOX.md": inbox(entry("Older")) } }), "HEAD");
  await makeCommit(h.root, "Another save target");
  await io.writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2, files: { "USER-INBOX.md": inbox(entry("Newer") + entry("Removed")) } }), "HEAD");
  await put(h.root, "USER-INBOX.md", inbox(entry("Newer")));
  const trial = trialReport(await h.migrate(true));
  expect(trial.differingNotes).toEqual([{ person: "andrew", path: "USER-INBOX.md", kind: "differs" }]);
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  await reconcile(h.root);
  const disk = await readFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), "utf8");
  expect(disk).toContain("Older prose.");
  expect(disk).toContain("Removed prose.");
  await put(h.root, "USER-INBOX.md", inbox(entry("Newer") + entry("Older")));
  await reconcile(h.root);
  expect(await readFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), "utf8")).not.toContain("Removed prose.");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const stored = success(await createRefStore(h.ports).read({ reference: personal("personal/inbox") }));
  expect(stored.content).toContain("Older prose.");
  expect(stored.content).not.toContain("Removed prose.");
}, 40_000);

it("reports snapshot-only files separately and ignores only shared-file tombstones", async () => {
  const h = await importFixture();
  await put(h.root, "USER-INBOX.md", inbox(entry("Keep")));
  await put(h.root, "memo.txt", "Restore these exact bytes.\n");
  await reconcile(h.root);
  await unlink(join(h.root, ".arc/user/andrew/memo.txt"));
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([{ person: "andrew", path: "memo.txt", kind: "snapshot-only" }]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await runUserLoad({ cwd: h.root, io: makeUserIO(h.root), identity: "andrew", currentWuName: "alpha" });
  expect(await readFile(join(h.root, ".arc/user/andrew/memo.txt"), "utf8")).toBe("Restore these exact bytes.\n");
  const clean = (await readFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), "utf8")).replace(/\n+$/u, "\n");
  await put(h.root, "USER-INBOX.md", clean);
  const tombstone = "## Removed: **Gone**\n\n- _Section:_ Errand\n- _Removed:_ " + new Date().toISOString() + "\n\n";
  await makeUserIO(h.root).writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2,
    files: { "USER-INBOX.md": clean + tombstone, "memo.txt": "Restore these exact bytes.\n" } }), "HEAD");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  expect(success(await store.read({ reference: personal("personal/inbox") })).content).not.toContain("## Removed:");
  expect(success(await store.read({ reference: personal("personal/document", "scratch/memo.txt") })).content).toBe("Restore these exact bytes.\n");
}, 40_000);

it.each(["default", "separate"] as const)("carries notes-excluded files but refuses environment files in %s", async layout => {
  const h = await importFixture(layout);
  const contents = new Map([
    ["large.md", "x".repeat(256 * 1024 + 1)], ["figure.svg", "<svg>text data</svg>\n"],
    ["README.md", "Personal readme\n"], [".hidden/note.txt", "Hidden personal prose.\n"],
    ["scratch/draft.md", "Unsaved scratch.\n"], ["ended/memo.txt", "An ended workspace.\n"],
  ]);
  for (const [path, content] of contents) await put(h.root, path, content);
  await put(h.root, ".env", "TOKEN=do-not-publish\n");
  await put(h.root, "STATUS.USER.md", "Generated cache\0");
  await put(h.root, ".internal/bookkeeping.json", "Machine local\0");
  await put(h.root, "alpha/.internal/checkpoint.json", "Machine local\0");
  const trial = trialReport(await h.migrate(true));
  expect(trial.differingNotes).toEqual([...contents.keys(), ".env"].sort().map(path => ({ person: "andrew", path, kind: "disk-only" })));
  expect(trial.refused).toEqual([{ reference: personal("personal/document", "scratch/.env"), rule: "store.env-file" }]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await unlink(join(h.root, ".arc/user/andrew/.env"));
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  for (const [path, content] of contents) expect(success(await store.read({ reference: personal("personal/document", `scratch/${path}`) })).content).toBe(content);
  const listed = success(await store.list({ family: "personal" }));
  expect(listed.status).toBe("complete");
  if (listed.status === "complete") expect(listed.records.map(record => record.reference.key).sort()).toEqual([...contents.keys()].map(path => `scratch/${path}`).sort());
}, 40_000);


it("selects each live workspace by notes history from any checkout and reconciles every copy", async () => {
  const h = await importFixture();
  for (const name of ["beta", "gamma"]) await writeFile(join(h.root, `.arc/active/meta-${name}.md`), makeMetaFixture(name, { owner: "andrew", branch: `feat/${name}` }));
  await h.git("git", ["add", ".arc/active"]);
  await h.git("git", ["commit", "-m", "Add parallel live work"]);
  await h.git("git", ["branch", "-f", "feat/alpha", "HEAD"]);
  const directory = await mkdtemp(join(tmpdir(), "arc-import-copies-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const alpha = join(directory, "alpha"), beta = join(directory, "beta"), gamma = join(directory, "gamma");
  await h.git("git", ["worktree", "add", alpha, "feat/alpha"]);
  await h.git("git", ["worktree", "add", "-b", "feat/beta", beta]);
  await h.git("git", ["worktree", "add", "-b", "feat/gamma", gamma]);
  await put(alpha, "alpha/memo.txt", "Alpha saved snapshot.\n");
  await reconcile(alpha);
  await makeCommit(beta, "Independent beta save");
  await put(beta, "beta/memo.txt", "Beta saved last.\n");
  await reconcile(beta, "beta");
  await put(gamma, "gamma/memo.txt", "No note holds this workspace.\n");
  const expected = [{ person: "andrew", path: "gamma/memo.txt", kind: "disk-only" }];
  for (const root of [alpha, beta, h.root]) {
    h.ports.checkoutRoot = root;
    expect(trialReport(await h.migrate(true)).differingNotes).toEqual(expected);
  }
  await put(alpha, "alpha/memo.txt", "Alpha changed on disk.\n");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([
    { person: "andrew", path: "alpha/memo.txt", kind: "differs" }, ...expected,
  ]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await reconcile(alpha);
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual(expected);
  await put(beta, "alpha/memo.txt", "Stale duplicate copy.\n");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([
    { person: "andrew", path: "alpha/memo.txt", kind: "differs" }, ...expected,
  ]);
  await put(beta, "alpha/memo.txt", "Alpha changed on disk.\n");
  await put(beta, "gamma/memo.txt", "Conflicting disk-only copy.\n");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([{ person: "andrew", path: "gamma/memo.txt", kind: "differs" }]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await put(beta, "gamma/memo.txt", "No note holds this workspace.\n");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  for (const [path, content] of [["alpha/memo.txt", "Alpha changed on disk.\n"], ["beta/memo.txt", "Beta saved last.\n"], ["gamma/memo.txt", "No note holds this workspace.\n"]]) {
    expect(success(await store.read({ reference: personal("personal/document", `scratch/${path}`) })).content).toBe(content);
  }
}, 60_000);


it("orders compacted notes by annotated committer date and keeps older saved paths out of disk-only", async () => {
  const h = await importFixture(), io = makeUserIO(h.root);
  const commitAt = async (date: string) => {
    const result = await promisify(execFile)("git", ["commit-tree", "HEAD^{tree}", "-m", date], { cwd: h.root,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return result.stdout.trim();
  };
  const older = await commitAt("2020-01-01T00:00:00Z"), newer = await commitAt("2021-01-01T00:00:00Z");
  const pruned = await commitAt("2022-01-01T00:00:00Z");
  await io.writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2, files: {
    "alpha/memo.txt": "Older workspace.\n", "alpha/removed.txt": "Removed in newest workspace.\n",
  } }), older);
  await io.writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2, files: { "alpha/memo.txt": "Newest workspace.\n" } }), newer);
  await io.writeNote("refs/notes/arc/user/andrew", JSON.stringify({ version: 2, files: { "gone/note.txt": "Prune this note.\n" } }), pruned);
  await h.git("git", ["push", "origin", "refs/notes/arc/user/andrew"]);
  const notes = await listNoteEntries(h.git, "refs/notes/arc/user/andrew");
  expect(await compactNotesRefSnapshot({ exec: io.exec, execInput: h.ports.execInput, fullRef: "refs/notes/arc/user/andrew",
    retained: notes.filter(note => note.commit !== pruned), pruned: notes.filter(note => note.commit === pruned) })).toMatchObject({ kind: "compacted" });
  expect((await h.git("git", ["rev-list", "--count", "refs/notes/arc/user/andrew"])).stdout.trim()).toBe("1");
  await put(h.root, "alpha/memo.txt", "Newest workspace.\n");
  await put(h.root, "alpha/removed.txt", "Removed in newest workspace.\n");
  await put(h.root, "alpha/never.txt", "Never saved.\n");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([
    { person: "andrew", path: "alpha/never.txt", kind: "disk-only" },
    { person: "andrew", path: "alpha/removed.txt", kind: "differs" },
  ]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await unlink(join(h.root, ".arc/user/andrew/alpha/removed.txt"));
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(success(await createRefStore(h.ports).read({ reference: personal("personal/document", "scratch/alpha/memo.txt") })).content).toBe("Newest workspace.\n");
}, 40_000);


it("compares every person's notes and stale root copies, including a notes-only identity", async () => {
  const h = await importFixture(), io = makeUserIO(h.root);
  await put(h.root, "memo.txt", "Andrew original.\n");
  await reconcile(h.root);
  await io.writeNote("refs/notes/arc/user/alex", JSON.stringify({ version: 2, files: { "memo.txt": "Alex original.\n" } }), "HEAD");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([{ person: "alex", path: "memo.txt", kind: "snapshot-only" }]);
  const alex = { cwd: h.root, io, identity: "alex", currentWuName: "alpha" };
  await runUserLoad(alex);
  const directory = await mkdtemp(join(tmpdir(), "arc-import-roots-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const checkout = join(directory, "linked");
  await h.git("git", ["worktree", "add", checkout, "feat/alpha"]);
  await put(checkout, "memo.txt", "Andrew stale.\n");
  await put(checkout, "memo.txt", "Alex stale.\n", "alex");
  expect(trialReport(await h.migrate(true)).differingNotes).toEqual([
    { person: "alex", path: "memo.txt", kind: "differs" }, { person: "andrew", path: "memo.txt", kind: "differs" },
  ]);
  expect(await h.migrate()).toMatchObject({ status: "refused" });
  await put(checkout, "memo.txt", "Andrew original.\n");
  await put(checkout, "memo.txt", "Alex original.\n", "alex");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  for (const [person, content] of [["alex", "Alex original.\n"], ["andrew", "Andrew original.\n"]]) {
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: person }, key: "scratch/memo.txt" });
    expect(success(await store.read({ reference })).content).toBe(content);
  }
}, 40_000);

it("reports unreadable personal materializations without landing and retries after access is restored", async () => {
  const h = await importFixture();
  await put(h.root, "memo.txt", "Read this personal file.\n");
  await reconcile(h.root);
  const read = h.ports.fs.readdir;
  h.ports.fs.readdir = async path => {
    if (path.endsWith("/user/andrew")) throw Object.assign(new Error("Permission denied"), { code: "EACCES" });
    return read(path);
  };
  const trial = trialReport(await h.migrate(true));
  expect(trial.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("personal"), remedy: expect.objectContaining({ text: expect.stringContaining("retry") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/"])).stdout).toBe("");
  h.ports.fs.readdir = read;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 40_000);
