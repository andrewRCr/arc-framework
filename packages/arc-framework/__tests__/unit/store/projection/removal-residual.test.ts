/** Residual-personal-file policy preserves uncertainty and ignores only registered machine-local paths. */
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { observeUnprojectedPersonalFiles } from "../../../../src/lib/store/projection/removal-residual.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { IDENTITY_STATUS_FILENAME } from "../../../../src/lib/user-surfaces.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-personal-residual-")); roots.push(root);
  await writeWorktreeMarker(root, { spawnedByArc: true, createdFor: { kind: "branch", ref: "chore/residual" },
    spawningIdentity: "test-user", createdAt: "2026-11-12T00:00:00Z" });
  const put = async (path: string) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, "Personal bytes.\n"); return target;
  };
  return { root, put };
}

it.each(["note.md", ".note.md.swp", "note.md~", IDENTITY_STATUS_FILENAME])("protects %s beneath an actual personal directory", async name => {
  const h = await fixture(), path = `.arc/user/not a slug/${name === IDENTITY_STATUS_FILENAME ? name : `scratch/${name}`}`;
  const file = await h.put(path);
  expect(await observeUnprojectedPersonalFiles(h.root)).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining(path) } });
  expect(await readFile(file, "utf8")).toBe("Personal bytes.\n");
});

it.each(["missing", "empty", "machine-local", "direct-user-file"])("allows %s personal roots", async shape => {
  const h = await fixture();
  if (shape === "empty") await mkdir(join(h.root, ".arc/user/anyone/scratch"), { recursive: true });
  if (shape === "machine-local") {
    await h.put(".arc/user/anyone/.internal/session.md");
    await h.put(".arc/user/anyone/work/.internal/state.md");
  }
  if (shape === "direct-user-file") await h.put(".arc/user/.npmignore");
  expect(await observeUnprojectedPersonalFiles(h.root)).toEqual({ kind: "passes" });
});

it.each(["readdir", "lstat", "disappeared-file"])("keeps %s failures unobservable and permits repair", async failure => {
  const h = await fixture(); await h.put(".arc/user/anyone/scratch/note.md");
  let denied = true;
  const error = Object.assign(new Error("Personal path cannot be observed"), { code: failure === "disappeared-file" ? "ENOENT" : "EACCES" });
  const fs = {
    readdir: (path: string) => denied && failure === "readdir" && path.endsWith("scratch") ? Promise.reject(error) : readdir(path),
    lstat: (path: string) => denied && failure !== "readdir" && path.endsWith("note.md") ? Promise.reject(error) : lstat(path),
  };
  expect(await observeUnprojectedPersonalFiles(h.root, fs)).toMatchObject({ kind: "unobservable", detail: expect.stringContaining(error.message) });
  denied = false;
  expect(await observeUnprojectedPersonalFiles(h.root, fs)).toMatchObject({ kind: "would-refuse" });
});

it.each(["absent", "manual-only"])("adds no policy for an %s marker", async marker => {
  const h = await fixture(); await h.put(".arc/user/anyone/note.md");
  if (marker === "absent") await rm(resolveWorktreeMarkerPath(h.root));
  else await writeWorktreeMarker(h.root, { spawnedByArc: true, createdFor: { kind: "errand", slug: "unknown", claimId: "a".repeat(32) },
    provisioning: "future", spawningIdentity: "test-user", createdAt: "2026-11-12T00:00:00Z" });
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected personal scan"); };
  expect(await observeUnprojectedPersonalFiles(h.root, { readdir: unexpected, lstat: unexpected })).toEqual({ kind: "passes" });
});

it("refuses an unreadable marker instead of treating it as unmanaged", async () => {
  const h = await fixture();
  await writeFile(resolveWorktreeMarkerPath(h.root), "{ malformed marker");
  expect(await observeUnprojectedPersonalFiles(h.root)).toMatchObject({ kind: "unobservable" });
});

it.each(["user-root", "personal-root", "nested-directory", "file"])("does not follow a %s symbolic link", async placement => {
  const h = await fixture(), external = await fixture();
  const outside = await external.put(placement === "user-root" ? "saved/anyone/note.md" : "saved/note.md");
  const path = placement === "user-root" ? ".arc/user" : placement === "personal-root" ? ".arc/user/anyone"
    : placement === "nested-directory" ? ".arc/user/anyone/scratch" : ".arc/user/anyone/note.md";
  const target = join(h.root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await symlink(placement === "file" ? outside : join(external.root, "saved"), target,
    placement === "file" ? "file" : "junction");
  expect(await observeUnprojectedPersonalFiles(h.root)).toEqual({ kind: "passes" });
  expect(await readFile(outside, "utf8")).toBe("Personal bytes.\n");
});
