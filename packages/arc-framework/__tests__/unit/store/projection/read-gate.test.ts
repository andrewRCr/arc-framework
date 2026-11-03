/** The read gate: an edit is read only once its save has settled, over an injected clock, stat, and sleep. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileStat } from "../../../../src/lib/store/projection/index-schema.js";
import { gateRead, type ReadGateDependencies } from "../../../../src/lib/store/projection/read-gate.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const MS = 1_000_000n;
const NOW = 10_000n * MS;
const PATH = "/checkout/.arc/active/meta-alpha.md";

const file = (size: bigint, ageMs: bigint): FileStat => ({ type: "file", size, mtimeNs: NOW - ageMs * MS, ino: 7n });

/** A gate whose stat answers each of `stats` in turn, the last one thereafter, recording each wait it pays. */
function gate(...stats: (FileStat | null)[]) {
  const waits: number[] = [];
  const deps: ReadGateDependencies = {
    now: () => NOW,
    stat: () => Promise.resolve(stats.length > 1 ? stats.shift() ?? null : stats[0] ?? null),
    sleep: (milliseconds) => { waits.push(milliseconds); return Promise.resolve(); },
  };
  return { waits, read: (markdown = true) => gateRead({ path: PATH, markdown }, deps) };
}

describe("the read gate", () => {
  it("defers an empty projected Markdown file 10 ms old at once", async () => {
    const empty = gate(file(0n, 10n), file(40n, 30n));
    expect(await empty.read()).toEqual({ kind: "pending", reason: "empty" });
    expect(empty.waits).toEqual([]);
  });

  it("reads an empty projected Markdown file 50 ms old as a deleted file, no edit, and an empty other file as read", async () => {
    expect(await gate(file(0n, 50n)).read()).toEqual({ kind: "no-edit", deleted: "emptied" });
    expect(await gate(file(0n, 50n)).read(false)).toEqual({ kind: "read", stat: file(0n, 50n) });
  });

  it("reads a symbolic link or anything else not a file at a projected path as a deleted file, never following it", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-gate-"));
    directories.push(root);
    await writeFile(join(root, "elsewhere.md"), "# Someone else's notes\n");
    await symlink(join(root, "elsewhere.md"), join(root, "linked.md"));
    await mkdir(join(root, "folder.md"));
    for (const name of ["linked.md", "folder.md"]) {
      const path = join(root, name);
      expect(await gateRead({ path, markdown: true })).toEqual({
        kind: "no-edit", deleted: "not-a-file",
        remedy: { text: `Replace ${path} with a regular file; a projected path that is not one is never followed or read.` },
      });
    }
  });

  it("reads a file modified 10 ms ago once two stats 15 ms apart agree on its size and modification time", async () => {
    const saved = file(120n, 10n);
    const settled = gate(saved, saved);
    expect(await settled.read()).toEqual({ kind: "read", stat: saved });
    expect(settled.waits).toEqual([15]);
    const grown = file(180n, 10n);
    expect(await gate(saved, grown, grown).read()).toEqual({ kind: "read", stat: grown });
    const touched = { ...saved, mtimeNs: saved.mtimeNs + 1n };
    const retouched = { ...saved, mtimeNs: saved.mtimeNs + 2n };
    expect(await gate(saved, touched, retouched, retouched).read()).toEqual({ kind: "read", stat: retouched });
  });

  it("reads a file modified 50 ms ago at once, with no wait", async () => {
    const older = gate(file(120n, 50n), file(140n, 1n));
    expect(await older.read()).toEqual({ kind: "read", stat: file(120n, 50n) });
    expect(older.waits).toEqual([]);
  });

  it("leaves a file still changing across three tries pending for the next command", async () => {
    const changing = gate(file(100n, 10n), file(110n, 9n), file(120n, 8n), file(130n, 7n));
    expect(await changing.read()).toEqual({ kind: "pending", reason: "unsettled" });
    expect(changing.waits).toEqual([15, 15, 15]);
  });

  it("judges each stat a try takes afresh: one emptied mid-save waits, and one gone reads as absent", async () => {
    expect(await gate(file(100n, 10n), file(0n, 1n)).read()).toEqual({ kind: "pending", reason: "empty" });
    expect(await gate(file(100n, 10n), null).read()).toEqual({ kind: "absent" });
    expect(await gate(null).read()).toEqual({ kind: "absent" });
  });
});
