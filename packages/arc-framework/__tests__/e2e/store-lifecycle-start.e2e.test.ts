/** Cold and named starts and their checkout binding through the built CLI. */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, it } from "vitest";

import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { git } from "./helpers.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import {
  expectLifecycleResult, lifecycleRepository, lifecycleSnapshot, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS,
  markerBytes, PERSONAL_BYTES, readLifecycleInventory, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";

const editorRoot = resolveArcPath({ kind: "editor-document-root" });

async function expectPlanningClaim(repo: string, checkout: string, name: string, spawnedByArc = false) {
  const record = await readLifecycleMeta(repo, name);
  expect(record).toMatchObject({ placement: { kind: "active" },
    fields: { state: "Planning", owner: LIFECYCLE_IDENTITY, branch: null } });
  const subject = seededWorkUnitSubject(record);
  expect(await readWorktreeMarker(checkout)).toMatchObject({ kind: "present",
    marker: { spawnedByArc, spawningIdentity: LIFECYCLE_IDENTITY, createdFor: subject } });
  return subject;
}

it("cold-starts on the protected base with one Planning primary and ignored checkout files", async () => {
  const h = await lifecycleRepository();
  await rm(join(h.repo, editorRoot), { recursive: true, force: true });
  const sibling = h.checkoutPath("unoccupied");
  await git(h.repo, ["worktree", "add", "--detach", sibling, h.base]);
  expect(await readLifecycleInventory(h.repo)).toEqual([]);

  const started = await h.run(["start", "--here", "--yes"]);

  expectLifecycleResult(started, 0, /Cold-started[\s\S]*Work unit:\s+main/u);
  const subject = await expectPlanningClaim(h.repo, h.repo, "main");
  expect(await readLifecycleInventory(h.repo)).toMatchObject([{ reference: { kind: "work-item/meta",
    owner: { name: "main", uid: subject.uid } }, fields: { state: "Planning" } }]);
  expect(await git(h.repo, ["rev-parse", "HEAD"])).toBe(h.base);
  expect(await git(h.repo, ["branch", "--show-current"])).toBe("main");
  expect(await git(h.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).toBe(`refs/heads/main ${h.base}`);
  const editorFiles = await readdir(join(h.repo, editorRoot));
  expect(editorFiles.length).toBeGreaterThan(0);
  const ignored = await git(h.repo, ["check-ignore", "--", resolveWorktreeMarkerPath(h.repo),
    ...editorFiles.map(file => `${editorRoot}/${file}`)]);
  expect(ignored).toContain("worktree-marker.json");
  for (const file of editorFiles) expect(ignored).toContain(`${editorRoot}/${file}`);
  const excludes = await readFile(join(h.repo, ".git/info/exclude"), "utf8");
  expect(excludes).toContain("worktree-marker.json");
  expect(excludes).toContain(`${editorRoot}/`);
  expect(await markerBytes(sibling)).toBeNull();
  await expect(readdir(join(sibling, editorRoot))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await git(h.repo, ["status", "--porcelain"])).toBe("");
}, LIFECYCLE_TIMEOUT_MS);

it("selects work-unit release for handoff from a started checkout", async () => {
  const h = await lifecycleRepository();
  const slug = "handoff-unit";
  const checkout = h.checkoutPath(slug);
  expectLifecycleResult(await h.run(["start", slug, "--new", "--yes"]), 0, /Started[\s\S]*handoff-unit/u);
  const { uid } = await expectPlanningClaim(h.repo, checkout, slug, true);

  const result = await h.run(["status", "--session-handoff", "--json"], checkout);

  expect(result.exitCode, result.output).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    mode: "session-handoff",
    handoffLocus: { ok: true, value: { kind: "release-work-unit", subject: { kind: "work-unit", key: slug, uid } } },
  });
}, LIFECYCLE_TIMEOUT_MS);

it("requires a name on detached HEAD and cold-starts there after a corrupt marker is removed", async () => {
  const h = await lifecycleRepository();
  const checkout = h.checkoutPath("detached");
  await git(h.repo, ["worktree", "add", "--detach", checkout, h.base]);
  const before = await lifecycleSnapshot(h.repo, checkout);
  expectLifecycleResult(await h.run(["start", "--here", "--yes"], checkout), 1, /name/iu);
  expect(await lifecycleSnapshot(h.repo, checkout)).toEqual(before);

  const path = resolveWorktreeMarkerPath(checkout);
  await mkdir(dirname(path), { recursive: true });
  const corrupt = Buffer.from("{");
  await writeFile(path, corrupt);
  const args = ["start", "detached-unit", "--new", "--here", "--yes"];
  const refused = await h.run(args, checkout);
  expectLifecycleResult(refused, 1, /repair[\s\S]*marker[\s\S]*retry/iu);
  expect(refused.output).toContain("worktree-marker.json");
  expect(await lifecycleSnapshot(h.repo, checkout)).toEqual({ ...before, marker: corrupt });

  await rm(path);
  expectLifecycleResult(await h.run(args, checkout), 0, /Cold-started[\s\S]*detached-unit/u);
  await expectPlanningClaim(h.repo, checkout, "detached-unit");
  expect(await lifecycleSnapshot(h.repo, checkout)).toMatchObject({ head: h.base, branch: "", worktrees: before.worktrees });
  expect(await markerBytes(h.repo)).toBeNull();
}, LIFECYCLE_TIMEOUT_MS);

it.each([
  { holder: "held work unit", message: /work unit 'reserved'[\s\S]*current name/iu },
  { holder: "former name", message: /work unit 'renamed'[\s\S]*former name/iu },
  { holder: "Errand", message: /Errand 'reserved'[\s\S]*current name/iu },
])("refuses a name held by a $holder and starts under an available name", async ({ holder, message }) => {
  const h = await lifecycleRepository();
  if (holder === "Errand") {
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "reserved" }));
    await seedStore(h.repo, LIFECYCLE_IDENTITY, [{ reference, content: transientContent(reference), placement: { kind: "active" } }]);
  } else {
    await seedWorkUnit(h.repo, "reserved", { identity: LIFECYCLE_IDENTITY,
      meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "draft-design" } });
    if (holder === "former name") {
      expectLifecycleResult(await h.run(["rename", "reserved", "renamed"]), 0, /renamed/iu);
    }
  }
  const before = await lifecycleSnapshot(h.repo);
  const refused = await h.run(["start", "reserved", "--new", "--here", "--yes"]);
  expectLifecycleResult(refused, 1, message);
  expect(refused.output).toMatch(/choose another name/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);

  expectLifecycleResult(await h.run(["start", "available", "--new", "--here", "--yes"]), 0, /Cold-started[\s\S]*available/u);
  await expectPlanningClaim(h.repo, h.repo, "available");
  expect(await lifecycleSnapshot(h.repo)).toMatchObject({ head: before.head, branch: before.branch, worktrees: before.worktrees });
}, LIFECYCLE_TIMEOUT_MS);

it.each(["in-place", "spawned"] as const)("refuses a second marker for a %s start and retries after release", async (mode) => {
  const h = await lifecycleRepository();
  const holder = h.checkoutPath("interrupted");
  const startedCheckout = mode === "spawned" ? h.checkoutPath("fresh") : h.repo;
  const worktreesWithoutHolder = await git(h.repo, ["worktree", "list", "--porcelain"]);
  await git(h.repo, ["worktree", "add", "--detach", holder, h.base]);
  const personal = join(holder, "personal.txt");
  if (mode === "in-place") await writeFile(personal, PERSONAL_BYTES);
  await writeWorktreeMarker(holder, { spawnedByArc: mode === "spawned", spawningIdentity: LIFECYCLE_IDENTITY,
    createdFor: { kind: "work-unit", name: "fresh" }, createdAt: "2026-10-24T00:00:00Z" });
  const marker = await markerBytes(holder);
  const before = await lifecycleSnapshot(h.repo);
  const args = ["start", "fresh", "--new", "--yes", ...(mode === "in-place" ? ["--here"] : [])];

  const refused = await h.run(args);
  expectLifecycleResult(refused, 1, /arc locus release/u);
  expect(refused.output).toContain(holder);
  expect(await markerBytes(holder)).toEqual(marker);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  await expect(readLifecycleMeta(h.repo, "fresh")).rejects.toThrow(/not-found/u);

  expectLifecycleResult(await h.run(["locus", "release", "--json"], holder), 0, /"status"\s*:\s*"released"/u);
  expect(await markerBytes(holder)).toBeNull();
  const worktrees = await git(h.repo, ["worktree", "list", "--porcelain"]);
  if (mode === "in-place") {
    expect(await readFile(personal)).toEqual(PERSONAL_BYTES);
    expect(worktrees).toBe(before.worktrees);
  } else {
    await expect(readdir(holder)).rejects.toMatchObject({ code: "ENOENT" });
    expect(worktrees).toBe(worktreesWithoutHolder);
  }
  expectLifecycleResult(await h.run(args), 0, /(?:Cold-started|Started)[\s\S]*fresh/u);
  await expectPlanningClaim(h.repo, startedCheckout, "fresh", mode === "spawned");
  expect(await git(startedCheckout, ["rev-parse", "HEAD"])).toBe(h.base);
  expect(await git(startedCheckout, ["branch", "--show-current"])).toBe(mode === "spawned" ? "" : "main");
  expect(await git(h.repo, ["rev-parse", "refs/heads/main"])).toBe(h.base);
  if (mode === "spawned") {
    const projected = ".arc/active/current/meta-fresh.md";
    const record = await readLifecycleMeta(h.repo, "fresh");
    const projectedMeta = parseStampedFile(await readFile(join(startedCheckout, projected), "utf8"));
    expect(projectedMeta).toMatchObject({ content: record.content, stamp: expect.any(String) });
    await expect(readFile(join(h.repo, projected))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await markerBytes(h.repo)).toBeNull();
  }
}, LIFECYCLE_TIMEOUT_MS);

it("rolls back an anchored claim when Git refuses the work-unit write and retries after repair", async () => {
  const h = await lifecycleRepository();
  const personal = join(h.repo, "personal-edit.txt");
  await writeFile(personal, PERSONAL_BYTES);
  const before = await lifecycleSnapshot(h.repo);
  expect(before.marker).toBeNull();
  expect(await readLifecycleInventory(h.repo)).toEqual([]);

  const hook = join(h.repo, ".git/arc/store/hooks/reference-transaction");
  await writeFile(hook, [
    "#!/bin/sh",
    'checkout="$(git rev-parse --absolute-git-dir)/../../.."',
    'if [ "$1" = prepared ] && grep -q " refs/arc/work/" && test -s "$checkout/.arc/system/.internal/worktree-marker.json"; then',
    '  echo "Refused work-unit write with anchored marker present" >&2',
    "  exit 1",
    "fi",
    "",
  ].join("\n"), { mode: 0o755, flag: "wx" });
  const args = ["start", "retry-unit", "--new", "--here", "--yes"];
  expectLifecycleResult(await h.run(args), 1, /Refused work-unit write with anchored marker present/u);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleInventory(h.repo)).toEqual([]);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);

  await rm(hook);
  expectLifecycleResult(await h.run(args), 0, /Cold-started[\s\S]*retry-unit/u);
  const subject = await expectPlanningClaim(h.repo, h.repo, "retry-unit");
  expect(await readLifecycleInventory(h.repo)).toMatchObject([{ reference: { owner: { uid: subject.uid } } }]);
  expect(await lifecycleSnapshot(h.repo)).toMatchObject({ head: before.head, branch: before.branch, worktrees: before.worktrees });
  expect(await git(h.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/", "refs/remotes/"])).toBe(`refs/heads/main ${h.base}`);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);
}, LIFECYCLE_TIMEOUT_MS);
