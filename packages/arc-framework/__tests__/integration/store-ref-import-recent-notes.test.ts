/** Import requires complete recent personal-note evidence even when no workspace remains live. */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { compactNotesRefSnapshot } from "../../src/lib/user-sync/compaction.js";
import { listNoteEntries } from "../../src/lib/user-sync/notes-ref.js";

const notesRef = "refs/notes/arc/user/alex";
const empty = '{"version":2,"files":{}}';
const inbox = "# User Inbox\n\n## Work Unit\n\n### **Saved observation**\n\n- _Id:_ `12345678`\n\nSaved-only prose.\n";
const savedManifest = JSON.stringify({ version: 2, files: { "USER-INBOX.md": inbox } });

async function fixture(layout: "default" | "separate") {
  const h = await importFixture(layout);
  const candidate = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
  await h.git("git", ["rm", "-r", ".arc/active", candidate]);
  await h.git("git", ["commit", "-m", "Remove the live workspace source"]);
  await h.git("git", ["branch", "-D", "feat/alpha"]);
  return h;
}

async function refusesBeforeLanding(h: Awaited<ReturnType<typeof fixture>>) {
  const tip = (await h.git("git", ["rev-parse", notesRef])).stdout;
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout;
  expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("alex's personal notes snapshot"),
      remedy: { text: expect.stringContaining("retry") } }),
  ]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect((await h.git("git", ["rev-parse", notesRef])).stdout).toBe(tip);
  expect((await h.git("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
}

async function exposesSavedOnlyThenImports(h: Awaited<ReturnType<typeof fixture>>) {
  expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { differingNotes: expect.arrayContaining([
    { person: "alex", path: "USER-INBOX.md", kind: "snapshot-only" },
  ]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  await mkdir(join(h.root, ".arc/user/alex"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/alex/USER-INBOX.md"), inbox);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}

describe.each(["default", "separate"] as const)("recent personal note import in %s", layout => {
  it.each([
    { defect: "malformed JSON", content: "{" },
    { defect: "unknown manifest version", content: '{"version":99,"files":{}}' },
    { defect: "array files", content: '{"version":2,"files":[]}' },
    { defect: "non-string file content", content: '{"version":2,"files":{"USER-INBOX.md":4}}' },
    { defect: "unsafe file path", content: '{"version":2,"files":{"../lost.md":"prose"}}' },
  ])("holds $defect with no live workspace and resumes after source repair", async ({ content }) => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", content, "HEAD"]);
    await refusesBeforeLanding(h);
    // Explicit fixture repair replaces the invalid history; a later overwrite would retain the invalid version.
    await h.git("git", ["notes", "--ref=refs/notes/import-repaired", "add", "-m", savedManifest, "HEAD"]);
    const repaired = (await h.git("git", ["rev-parse", "refs/notes/import-repaired"])).stdout.trim();
    await h.git("git", ["update-ref", notesRef, repaired]);
    await h.git("git", ["update-ref", "-d", "refs/notes/import-repaired"]);
    await exposesSavedOnlyThenImports(h);
  }, 60_000);

  it.each(["history", "changed paths", "note content"] as const)("holds a failed %s read and resumes after recovery", async defect => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", savedManifest, "HEAD"]);
    let broken = true;
    const fails = (args: readonly string[]): boolean => broken && (defect === "history"
      ? args.includes("log") && args.some(arg => arg.startsWith("--since"))
      : defect === "changed paths" ? args.includes("diff-tree")
        : args.includes("show") && args.some(arg => /^[0-9a-f]{40,64}:[0-9a-f/]+$/u.test(arg)));
    const exec = h.ports.exec, raw = h.ports.rawExec;
    h.ports.exec = async (command, args, options) => {
      if (fails(args)) throw new Error(`Cannot read ${defect} from fixture notes`);
      return exec(command, args, options);
    };
    h.ports.rawExec = async (args, options) => {
      if (fails(args)) throw new Error(`Cannot read ${defect} from fixture notes`);
      return raw(args, options);
    };
    await refusesBeforeLanding(h);
    broken = false;
    await exposesSavedOnlyThenImports(h);
  }, 60_000);

  it("holds a missing recent note blob and resumes after its original bytes are restored", async () => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", savedManifest, "HEAD"]);
    const oid = (await h.git("git", ["notes", `--ref=${notesRef}`, "list", "HEAD"])).stdout.trim();
    const path = join(h.root, ".git", "objects", oid.slice(0, 2), oid.slice(2)), saved = await readFile(path);
    try { await unlink(path); await refusesBeforeLanding(h); }
    finally { await writeFile(path, saved, { mode: 0o444 }); }
    await exposesSavedOnlyThenImports(h);
  }, 60_000);

  it("holds a present notes ref whose commit object is missing and resumes after restoration", async () => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", savedManifest, "HEAD"]);
    const tip = (await h.git("git", ["rev-parse", notesRef])).stdout.trim();
    const path = join(h.root, ".git", "objects", tip.slice(0, 2), tip.slice(2)), saved = await readFile(path);
    try { await unlink(path); await refusesBeforeLanding(h); }
    finally { await writeFile(path, saved, { mode: 0o444 }); }
    await exposesSavedOnlyThenImports(h);
  }, 60_000);

  it("accepts an absent notes ref for an identity with no saved or materialized files", async () => {
    const h = await fixture(layout);
    await mkdir(join(h.root, ".arc/user/alex"), { recursive: true });
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it.each(["age", "count"] as const)("does not validate a malformed root payload excluded by the %s window", async exclusion => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", "{", "HEAD"]);
    if (exclusion === "age") {
      const tip = (await h.git("git", ["rev-parse", notesRef])).stdout.trim();
      const content = (await h.git("git", ["cat-file", "commit", tip])).stdout
        .replace(/^(author|committer) (.*) \d+ [+-]\d{4}$/gmu, "$1 $2 946684800 +0000");
      const older = await h.ports.execInput(["hash-object", "-w", "-t", "commit", "--stdin"], content);
      await h.git("git", ["update-ref", notesRef, older.trim(), tip]);
    }
    const count = exclusion === "count" ? 10 : 1;
    for (let serial = 0; serial < count; serial += 1) await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-f", "-m",
      serial === 0 ? empty : JSON.stringify({ version: 2, files: {}, serial }), "HEAD"]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it("retains supported version-one root manifests", async () => {
    const h = await fixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", savedManifest.replace('"version":2', '"version":1'), "HEAD"]);
    await exposesSavedOnlyThenImports(h);
  }, 60_000);

  it("excludes a real compaction snapshot's note payload from the root merge window", async () => {
    const h = await fixture(layout), current = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", empty, current]);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", empty.replace('"version":2', '"version":1'), "HEAD^"]);
    await h.git("git", ["push", "origin", `${notesRef}:${notesRef}`]);
    const entries = await listNoteEntries(h.git, notesRef), kept = entries.find(entry => entry.commit === current);
    if (!kept) throw new Error("Expected the retained note");
    expect(await compactNotesRefSnapshot({ exec: h.git, execInput: h.ports.execInput, fullRef: notesRef,
      retained: [kept], pruned: entries.filter(entry => entry.commit !== current) })).toMatchObject({ kind: "compacted" });
    const path = join(h.root, ".git", "objects", kept.blob.slice(0, 2), kept.blob.slice(2)), saved = await readFile(path);
    try {
      await unlink(path);
      expect(await h.migrate()).toMatchObject({ status: "ok" });
    } finally { await writeFile(path, saved, { mode: 0o444 }); }
  }, 60_000);
});
