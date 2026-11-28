/** Graduation and materialization preserve the work unit's identity through checkout placement. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, it } from "vitest";

import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { nativeGitPath } from "../../src/lib/local-path-identity.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import {
  expectLifecycleResult, lifecycleRepository, lifecycleSnapshot, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS,
  markerBytes, PERSONAL_BYTES, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";
import { commitAll, git, runArcAnchored } from "./helpers.js";

const planning = { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "draft-design" } as const;

async function expectPlacement(repo: string, checkout: string, slug: string, tip: string, branch: string,
  spawnedByArc: boolean) {
  const record = await readLifecycleMeta(repo, slug);
  expect(await readWorktreeMarker(checkout)).toMatchObject({ kind: "present",
    marker: { spawnedByArc, spawningIdentity: LIFECYCLE_IDENTITY, createdFor: seededWorkUnitSubject(record) } });
  expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(tip);
  expect(await git(checkout, ["branch", "--show-current"])).toBe(branch);
  const worktrees = await git(repo, ["worktree", "list", "--porcelain"]);
  const registeredPaths = worktrees.split(/\r?\n/u)
    .filter(line => line.startsWith("worktree "))
    .map(line => nativeGitPath(line.slice("worktree ".length)));
  expect(registeredPaths).toContain(checkout);
}

it("refuses graduation into an interrupted claim and graduates the same stub after release", async () => {
  const h = await lifecycleRepository();
  await seedWorkUnit(h.repo, "planned-work", { identity: LIFECYCLE_IDENTITY, meta: { ...planning, workClass: "Light" },
    placement: { kind: "backlog", commitment: "planned" } });
  const stub = await readLifecycleMeta(h.repo, "planned-work");
  await writeWorktreeMarker(h.repo, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "planned-work" },
    spawningIdentity: LIFECYCLE_IDENTITY, createdAt: "2026-10-24T00:00:00Z" });
  const before = await lifecycleSnapshot(h.repo);
  const args = ["start", "planned-work", "--here", "--yes"];

  const refused = await h.run(args);
  expectLifecycleResult(refused, 1, /unbound work-unit marker[\s\S]*arc locus release/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "planned-work")).toEqual(stub);

  expectLifecycleResult(await h.run(["locus", "release", "planned-work", "--json"]), 0, /"status"\s*:\s*"released"/u);
  expect(await markerBytes(h.repo)).toBeNull();
  expectLifecycleResult(await h.run(args), 0, /Started in Planning[\s\S]*planned-work/u);
  const graduated = await readLifecycleMeta(h.repo, "planned-work");
  expect(graduated).toMatchObject({ reference: stub.reference, placement: { kind: "active" },
    fields: { state: "Planning", owner: LIFECYCLE_IDENTITY, branch: null } });
  await expectPlacement(h.repo, h.repo, "planned-work", h.base, "main", false);
  expect(await git(h.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).toBe(`refs/heads/main ${h.base}`);
}, LIFECYCLE_TIMEOUT_MS);

it.each(["start", "materialize"] as const)("refuses %s --here while a partial Errand holds the checkout and retries after abandon", async verb => {
  const h = await lifecycleRepository({ protection: "partial", remote: true });
  await seedWorkUnit(h.repo, "planned-work", { identity: LIFECYCLE_IDENTITY, meta: { ...planning, workClass: "Light" },
    placement: verb === "start" ? { kind: "backlog", commitment: "planned" } : { kind: "active" } });
  const errand = async (action: "open" | "abandon") => {
    const args = ["errand", action, "occupying-errand", "--json"];
    const result = await runArcAnchored(args, h.repo, { env: { FORCE_COLOR: undefined } });
    expectLifecycleResult({ ...result, output: result.stdout + result.stderr, command: `arc ${args.join(" ")}` },
      0, /"outcome"\s*:\s*"applied"/u);
  };
  await errand("open");
  const before = await lifecycleSnapshot(h.repo);
  expect(await readWorktreeMarker(h.repo)).toMatchObject({ kind: "present",
    marker: { createdFor: { kind: "partial-errand", slug: "occupying-errand" } } });
  const record = await readLifecycleMeta(h.repo, "planned-work");
  const args = [verb, "planned-work", "--here", ...(verb === "start" ? ["--yes"] : [])];

  expectLifecycleResult(await h.run(args), 1, /finish[\s\S]*promote[\s\S]*abandon/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "planned-work")).toEqual(record);

  await errand("abandon");
  expect(await markerBytes(h.repo)).toBeNull();
  expectLifecycleResult(await h.run(args), 0, /(?:Started in Planning|Materialized)[\s\S]*planned-work/u);
  const placed = await readLifecycleMeta(h.repo, "planned-work");
  expect(placed).toMatchObject({ reference: record.reference, placement: { kind: "active" } });
  if (verb === "materialize") expect(placed).toEqual(record);
  await expectPlacement(h.repo, h.repo, "planned-work", h.base, "main", false);
}, LIFECYCLE_TIMEOUT_MS);

it("refuses to materialize another person's released work and binds its original UID for the owner", async () => {
  const h = await lifecycleRepository();
  const slug = "released-work";
  const owner = "another-user";
  await seedWorkUnit(h.repo, slug, { identity: owner, meta: { ...planning, owner } });
  const record = await readLifecycleMeta(h.repo, slug);
  const before = await lifecycleSnapshot(h.repo);
  expect(before.marker).toBeNull();
  const args = ["materialize", slug, "--here"];

  expectLifecycleResult(await h.run(args), 1, /released-work is not owned in-flight work/u);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, slug)).toEqual(record);

  await git(h.repo, ["config", "--local", "arc.identity", owner]);
  expectLifecycleResult(await h.run(args), 0, /Materialized[\s\S]*released-work/u);
  expect(await readWorktreeMarker(h.repo)).toMatchObject({ kind: "present",
    marker: { spawnedByArc: false, spawningIdentity: owner, createdFor: seededWorkUnitSubject(record) } });
  expect(await readLifecycleMeta(h.repo, slug)).toEqual(record);
}, LIFECYCLE_TIMEOUT_MS);

it("refuses a corrupt marker and materializes branchless work in place without moving personal code", async () => {
  const h = await lifecycleRepository();
  await seedWorkUnit(h.repo, "branchless-work", { identity: LIFECYCLE_IDENTITY, meta: planning });
  const record = await readLifecycleMeta(h.repo, "branchless-work");
  await git(h.repo, ["switch", "-c", "personal-work"]);
  await git(h.repo, ["commit", "--allow-empty", "-m", "Personal work ahead of base"]);
  const personal = join(h.repo, "personal-edit.txt");
  await writeFile(personal, PERSONAL_BYTES);
  const marker = resolveWorktreeMarkerPath(h.repo);
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "{not valid marker JSON\n");
  const before = await lifecycleSnapshot(h.repo);
  const args = ["materialize", "branchless-work", "--here"];

  expectLifecycleResult(await h.run(args), 1, /repair[\s\S]*marker[\s\S]*retry/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "branchless-work")).toEqual(record);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);

  await rm(marker);
  expectLifecycleResult(await h.run(args), 0, /Materialized[\s\S]*current HEAD preserved/u);
  await expectPlacement(h.repo, h.repo, "branchless-work", before.head, before.branch, false);
  expect(await lifecycleSnapshot(h.repo)).toMatchObject({ refs: before.refs, worktrees: before.worktrees });
  expect(await readLifecycleMeta(h.repo, "branchless-work")).toEqual(record);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);
}, LIFECYCLE_TIMEOUT_MS);

it("refuses an occupied checkout before fetching and materializes the remote tip after pause and release", async () => {
  const h = await lifecycleRepository({ remote: true });
  const branch = "feat/remote-work";
  await seedWorkUnit(h.repo, "remote-work", { identity: LIFECYCLE_IDENTITY, branch, meta: planning });
  await seedWorkUnit(h.repo, "occupant", { identity: LIFECYCLE_IDENTITY, bind: h.repo, meta: planning });
  const remoteRecord = await readLifecycleMeta(h.repo, "remote-work");
  const occupant = await readLifecycleMeta(h.repo, "occupant");
  await git(h.repo, ["switch", "-c", branch]);
  await writeFile(join(h.repo, "remote-work.txt"), "Remote work\n");
  await commitAll(h.repo, "Commit remote work");
  const tip = await git(h.repo, ["rev-parse", "HEAD"]);
  await git(h.repo, ["push", "origin", branch]);
  await git(h.repo, ["switch", "main"]);
  await git(h.repo, ["branch", "-D", branch]);
  for (const ref of ["main", branch]) await git(h.repo, ["update-ref", "-d", `refs/remotes/origin/${ref}`]);
  const before = await lifecycleSnapshot(h.repo);
  const args = ["materialize", "remote-work", "--here"];

  expectLifecycleResult(await h.run(args), 1, /occupant[\s\S]*pause/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "remote-work")).toEqual(remoteRecord);
  expect(await readLifecycleMeta(h.repo, "occupant")).toEqual(occupant);

  expectLifecycleResult(await h.run(["pause", "occupant", "--reason", "Free this checkout"]), 0, /paused/iu);
  expectLifecycleResult(await h.run(["locus", "release", "occupant", "--json"]), 0, /"status"\s*:\s*"released"/u);
  expect(await markerBytes(h.repo)).toBeNull();
  expectLifecycleResult(await h.run(args), 0, /Materialized[\s\S]*feat\/remote-work/u);
  await expectPlacement(h.repo, h.repo, "remote-work", tip, branch, false);
  expect(await git(h.repo, ["rev-parse", `refs/heads/${branch}`])).toBe(tip);
  expect(await git(h.repo, ["rev-parse", `refs/remotes/origin/${branch}`])).toBe(tip);
  expect(await git(h.repo, ["rev-parse", "refs/heads/main"])).toBe(h.base);
  expect(await readLifecycleMeta(h.repo, "remote-work")).toEqual(remoteRecord);
  expect(await readFile(join(h.repo, "remote-work.txt"), "utf8")).toContain("Remote work");
}, LIFECYCLE_TIMEOUT_MS);

it.each(["local branch", "branchless work"] as const)("materializes %s in a new checkout without a remote", async kind => {
  const h = await lifecycleRepository();
  const checkout = h.checkoutPath("released-work");
  const branch = kind === "local branch" ? "feat/released-work" : undefined;
  let tip = h.base;
  if (branch !== undefined) {
    await git(h.repo, ["switch", "-c", branch]);
    await git(h.repo, ["commit", "--allow-empty", "-m", "Local work"]);
    tip = await git(h.repo, ["rev-parse", "HEAD"]);
    await git(h.repo, ["switch", "main"]);
  }
  await seedWorkUnit(h.repo, "released-work", { identity: LIFECYCLE_IDENTITY, meta: planning, branch });
  const record = await readLifecycleMeta(h.repo, "released-work");
  const before = await lifecycleSnapshot(h.repo);

  expectLifecycleResult(await h.run(["materialize", "released-work"]), 0, /Materialized[\s\S]*released-work/u);
  await expectPlacement(h.repo, checkout, "released-work", tip, branch ?? "", true);
  expect(await lifecycleSnapshot(h.repo)).toMatchObject({ head: before.head, branch: before.branch, refs: before.refs, marker: null });
  expect(await readLifecycleMeta(h.repo, "released-work")).toEqual(record);
}, LIFECYCLE_TIMEOUT_MS);

it("directs in-place materialization to the checkout holding the branch and claims it there", async () => {
  const h = await lifecycleRepository();
  const holder = h.checkoutPath("external");
  const branch = "feat/placed-work";
  await git(h.repo, ["worktree", "add", "-b", branch, holder, h.base]);
  await seedWorkUnit(h.repo, "placed-work", { identity: LIFECYCLE_IDENTITY, meta: planning, branch });
  const record = await readLifecycleMeta(h.repo, "placed-work");
  const before = await lifecycleSnapshot(h.repo);
  const holderBefore = await lifecycleSnapshot(h.repo, holder);
  const args = ["materialize", "placed-work", "--here"];

  const refused = await h.run(args);
  expectLifecycleResult(refused, 1, /already has feat\/placed-work out[\s\S]*arc materialize placed-work --here/u);
  expect(refused.output).toContain(holder);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await lifecycleSnapshot(h.repo, holder)).toEqual(holderBefore);
  expect(await readLifecycleMeta(h.repo, "placed-work")).toEqual(record);

  expectLifecycleResult(await h.run(args, holder), 0, /Materialized[\s\S]*placed-work/u);
  await expectPlacement(h.repo, holder, "placed-work", h.base, branch, false);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "placed-work")).toEqual(record);
}, LIFECYCLE_TIMEOUT_MS);

it("refuses a missing linked branch and materializes it after the holding clone publishes it", async () => {
  const h = await lifecycleRepository({ remote: true });
  const writer = h.checkoutPath("publisher");
  const branch = "feat/unpublished-work";
  await git(h.repo, ["clone", h.origin, writer]);
  await git(writer, ["switch", "-c", branch]);
  await seedWorkUnit(h.repo, "unpublished-work", { identity: LIFECYCLE_IDENTITY, meta: planning, branch });
  const record = await readLifecycleMeta(h.repo, "unpublished-work");
  const before = await lifecycleSnapshot(h.repo);
  const args = ["materialize", "unpublished-work", "--here"];

  expectLifecycleResult(await h.run(args), 1, /origin lacks feat\/unpublished-work[\s\S]*git push/iu);
  expect(await lifecycleSnapshot(h.repo)).toEqual(before);
  expect(await readLifecycleMeta(h.repo, "unpublished-work")).toEqual(record);

  await git(writer, ["push", "-u", "origin", branch]);
  expectLifecycleResult(await h.run(args), 0, /Materialized[\s\S]*feat\/unpublished-work/u);
  await expectPlacement(h.repo, h.repo, "unpublished-work", h.base, branch, false);
  expect(await git(h.repo, ["rev-parse", `refs/remotes/origin/${branch}`])).toBe(h.base);
  expect(await git(h.repo, ["rev-parse", "refs/heads/main"])).toBe(h.base);
  expect(await readLifecycleMeta(h.repo, "unpublished-work")).toEqual(record);
}, LIFECYCLE_TIMEOUT_MS);
