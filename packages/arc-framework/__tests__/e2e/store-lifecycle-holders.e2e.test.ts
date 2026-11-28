/** Rename and teardown locate anchored holders from another checkout. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { readStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import {
  expectLifecycleResult, lifecycleRepository, lifecycleSnapshot, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS,
  markerBytes, PERSONAL_BYTES, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";
import { git } from "./helpers.js";

it("renames a branchless work unit from outside its detached anchored holder", async () => {
  const h = await lifecycleRepository();
  const holder = h.checkoutPath("personal-checkout");
  await git(h.repo, ["worktree", "add", "--detach", holder, h.base]);
  await git(holder, ["commit", "--allow-empty", "-m", "Personal detached commit"]);
  const personal = join(holder, "personal-edit.txt");
  await writeFile(personal, PERSONAL_BYTES);
  await seedWorkUnit(h.repo, "old-name", { identity: LIFECYCLE_IDENTITY, bind: holder,
    meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "draft-design" } });
  const record = await readLifecycleMeta(h.repo, "old-name");
  const before = await lifecycleSnapshot(h.repo, holder);
  const codeRefs = await git(h.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/", "refs/remotes/"]);

  expectLifecycleResult(await h.run(["rename", "old-name", "new-name"]), 0, /renamed[\s\S]*new-name/iu);

  const renamed = await readLifecycleMeta(h.repo, "new-name");
  expect(renamed.reference.owner).toMatchObject({ name: "new-name", uid: seededWorkUnitSubject(record).uid });
  expect(renamed).toMatchObject({ placement: record.placement, aliases: expect.arrayContaining(["old-name"]),
    fields: { state: "Planning", owner: LIFECYCLE_IDENTITY, branch: null } });
  expect(await readWorktreeMarker(holder)).toMatchObject({ kind: "present", marker: { spawnedByArc: false,
    createdFor: seededWorkUnitSubject(renamed) } });
  expect(await markerBytes(h.repo)).toBeNull();
  expect(await lifecycleSnapshot(h.repo, holder)).toMatchObject({ head: before.head, branch: "", worktrees: before.worktrees });
  expect(await git(h.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/", "refs/remotes/"])).toBe(codeRefs);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);
}, LIFECYCLE_TIMEOUT_MS);

it("refuses duplicate retirement markers and releases only the adopted holder after repair", async () => {
  const h = await lifecycleRepository({ remote: true });
  const holder = h.checkoutPath("personal-checkout");
  const stray = h.checkoutPath("stray");
  const branch = "feat/personal-work";
  await git(h.repo, ["worktree", "add", "-b", branch, holder, h.base]);
  await git(holder, ["push", "-u", "origin", branch]);
  await git(h.repo, ["worktree", "add", "--detach", stray, h.base]);
  const personal = join(holder, "personal-edit.txt");
  await writeFile(personal, PERSONAL_BYTES);

  const placement = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") } as const;
  const { meta } = await seedWorkUnit(h.repo, "shipped-work", { identity: LIFECYCLE_IDENTITY, branch, placement,
    meta: { state: "Shipped", owner: LIFECYCLE_IDENTITY, branch, currentWorkflow: null, completed: "2026-07-14",
      prUrl: "https://example.test/pull/1" } });
  const seeded = await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, meta.reference);
  const link = seeded.links?.branches?.[0];
  if (link === undefined) throw new Error("Expected the fixture to link the personal branch");
  await seedStore(h.repo, LIFECYCLE_IDENTITY, [{ reference: seeded.reference, content: seeded.content, expected: seeded.version,
    placement, links: { branches: [{ ...link, linkedAs: "adopted" }] } }]);
  const completed = await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, meta.reference);
  for (const checkout of [holder, stray]) {
    await writeWorktreeMarker(checkout, { spawnedByArc: false, createdFor: seededWorkUnitSubject(completed),
      spawningIdentity: LIFECYCLE_IDENTITY, createdAt: "2026-10-24T00:00:00Z" });
  }
  const before = await lifecycleSnapshot(h.repo, holder);
  const strayBefore = await lifecycleSnapshot(h.repo, stray);
  const remoteBefore = await git(h.repo, ["ls-remote", "--heads", "origin"]);
  const args = ["teardown", "shipped-work"];

  const refused = await h.run(args);
  expectLifecycleResult(refused, 1, /repair or remove the stray marker/iu);
  for (const checkout of [holder, stray]) expect(refused.output).toContain(resolveWorktreeMarkerPath(checkout));
  expect(await lifecycleSnapshot(h.repo, holder)).toEqual(before);
  expect(await lifecycleSnapshot(h.repo, stray)).toEqual(strayBefore);
  expect(await git(h.repo, ["ls-remote", "--heads", "origin"])).toBe(remoteBefore);
  expect(await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, completed.reference)).toEqual(completed);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);

  await rm(resolveWorktreeMarkerPath(stray));
  const unprojected = await h.run(args);
  expectLifecycleResult(unprojected, 1, /projection index[\s\S]*missing[\s\S]*arc save/iu);
  expect(await lifecycleSnapshot(h.repo, holder)).toEqual(before);
  expect(await lifecycleSnapshot(h.repo, stray)).toEqual({ ...strayBefore, marker: null });
  expect(await git(h.repo, ["ls-remote", "--heads", "origin"])).toBe(remoteBefore);
  expect(await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, completed.reference)).toEqual(completed);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);

  expectLifecycleResult(await h.run(["save", "--json"], holder), 0, /"status"\s*:\s*"ok"/u);
  const repaired = await h.run(args);
  expectLifecycleResult(repaired, 0, /Torn down/iu);
  expect(repaired.output).toMatch(/Kept feat\/personal-work[\s\S]*adopted/iu);
  expect(await lifecycleSnapshot(h.repo, holder)).toEqual({ ...before, marker: null });
  expect(await lifecycleSnapshot(h.repo, stray)).toEqual({ ...strayBefore, marker: null });
  expect(await git(h.repo, ["ls-remote", "--heads", "origin"])).toBe(remoteBefore);
  expect(await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, completed.reference)).toEqual(completed);
  expect(await readFile(personal)).toEqual(PERSONAL_BYTES);
}, LIFECYCLE_TIMEOUT_MS);
