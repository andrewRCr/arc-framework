/** Coordinate and path-set changes refuse source acquisition through real Git. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { acquireSourceBoundary, type SourceBoundary } from "../../src/lib/checks/runner/source-boundary.js";

const git = createExecaGitExec();
const io = { git, gitRaw: createExecaRawGitExec() };
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

async function fixture() {
  const root = await createTempRepoCore({ prefix: "arc-source-boundary-" });
  repositories.push(root);
  await writeFile(join(root, "source.txt"), "source\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "source"], { cwd: root });
  const result = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (result.status !== "resolved") throw new Error(result.message);
  return { root, request: result.request };
}

it("acquires stable coordinates and raw enumerated paths without changing the original index", async () => {
  const { root, request } = await fixture();
  const index = await readFile(join(root, ".git", "index"));
  const boundary = await acquireSourceBoundary(io, root, request);
  try {
    expect(boundary.coordinates).toEqual({ tree: request.tree, head: request.source.head.status === "known"
      ? request.source.head.commit : undefined, base: request.base, merged: [] });
    expect(Buffer.from(boundary.pathListing).toString("utf8")).toBe("source.txt\0");
    await boundary.recheck();
    expect(await readFile(join(root, ".git", "index"))).toEqual(index);
  } finally { await boundary.remove(); }
});

it.each(["bytes", "paths", "HEAD"])("refuses changed %s during capture and permits fresh acquisition", async kind => {
  const { root, request } = await fixture();
  const indexes = new Set<string>();
  const observedIO = { ...io, git: async (...args: Parameters<typeof git>) => {
    if (args[2]?.indexFile !== undefined) indexes.add(args[2].indexFile);
    return git(...args);
  } };
  const originalIndex = await readFile(join(root, ".git", "index"));
  const boundary = await acquireSourceBoundary(observedIO, root, request);
  try {
    if (kind === "HEAD") await git("git", ["commit", "--allow-empty", "-m", "concurrent HEAD"], { cwd: root });
    else await writeFile(join(root, kind === "paths" ? "new.txt" : "source.txt"), "concurrent\n");
    await expect(boundary.recheck()).rejects.toThrow(/changed.*retry/iu);
    expect(indexes.size).toBeGreaterThan(0);
    for (const index of indexes) await expect(access(dirname(index))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(root, ".git", "index"))).toEqual(originalIndex);
  } finally { await boundary.remove(); }
  const fresh = await resolveCheckRequest(git, root, { form: { kind: "run", ids: ["check"] } });
  if (fresh.status !== "resolved") throw new Error(fresh.message);
  const retry = await acquireSourceBoundary(io, root, fresh.request);
  try { await retry.recheck(); } finally { await retry.remove(); }
});

it("refuses a tree that changed before acquisition and releases only its own index", async () => {
  const { root, request } = await fixture();
  const indexes = new Set<string>();
  await writeFile(join(root, "source.txt"), "already changed\n");
  const originalIndex = await readFile(join(root, ".git", "index"));
  let unexpected: SourceBoundary | undefined;
  try {
    await expect(acquireSourceBoundary({ ...io, git: async (...args: Parameters<typeof git>) => {
      if (args[2]?.indexFile !== undefined) indexes.add(args[2].indexFile);
      return git(...args);
    } }, root, request).then(boundary => { unexpected = boundary; return boundary; })).rejects.toThrow(/changed.*retry/iu);
  } finally { await unexpected?.remove(); }
  for (const index of indexes) await expect(access(dirname(index))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, ".git", "index"))).toEqual(originalIndex);
});

it("rechecks the selected index independently from conflicting live worktree bytes", async () => {
  const { root } = await fixture();
  const selected = await resolveCheckRequest(git, root, { form: { kind: "pre-commit" } });
  if (selected.status !== "resolved") throw new Error(selected.message);
  await writeFile(join(root, "source.txt"), "later live content\n");
  const boundary = await acquireSourceBoundary(io, root, selected.request);
  try {
    await boundary.recheck();
    await git("git", ["add", "source.txt"], { cwd: root });
    await expect(boundary.recheck()).rejects.toThrow(/changed.*retry/iu);
  } finally { await boundary.remove(); }
});

it("rechecks the pushed commit independently from a later caller HEAD", async () => {
  const { root } = await fixture();
  const tip = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout;
  const selected = await resolveCheckRequest(git, root, { form: { kind: "pre-push", ref: "refs/heads/topic", tip, old: tip } });
  if (selected.status !== "resolved") throw new Error(selected.message);
  await writeFile(join(root, "source.txt"), "later committed content\n");
  await git("git", ["add", "-A"], { cwd: root });
  await git("git", ["commit", "-m", "later caller HEAD"], { cwd: root });
  const boundary = await acquireSourceBoundary(io, root, selected.request);
  try {
    await boundary.recheck();
    expect(boundary.coordinates.head).toBe(tip);
  } finally { await boundary.remove(); }
});
