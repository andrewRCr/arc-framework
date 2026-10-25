/** Store-linked orphan classification with actual local Git history and tracking refs. */
import { expect, it, onTestFinished, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { runStoreRename } from "../../src/lib/work-unit/verbs/rename-store.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { acquireStoreClaims } from "../../src/lib/errand/store-discovery.js";
import { analyzeOrphanBranchesSnapshot, runOrphanBranchSweep, OrphanBranchSweepResultSchema } from "../../src/lib/session-init/orphan-branch-sweep.js";
import type { OrphanStoreOptions } from "../../src/lib/session-init/orphan-store-candidates.js";
const repository = "11111111-1111-4111-8111-111111111111";
it.each([false, true])("a reused branch has no teardown offer and retains its merge guard (unmerged=%s)", async unmerged => {
  const h = await fixture(), name = "topic/reused";
  await h.branch(name, unmerged);
  const links = { branches: [{ repository, ref: name, linkedAs: "created" as const, excluded: [] }] };
  await h.seedMeta("reused", { state: "Shipped" }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, links);
  await h.seedMeta("reused", {}, { kind: "active" }, links);
  const result = await h.sweep("snapshot", [name]);
  expect(result.warnings ?? []).toEqual([]);
  expect(result.orphans).toMatchObject([{ branch: name, merged: !unmerged, shippedWorkUnit: null }]);
  const orphan = result.orphans[0];
  if (orphan === undefined || orphan.merged === null) throw new Error("Expected complete branch evidence");
  const actions = orphan.actions ?? [];
  expect(actions.some(action => action.argv?.includes("teardown"))).toBe(false);
  expect(actions.some(action => action.argv?.[0] === "git")).toBe(!unmerged);
});
async function fixture() {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["commit", "--allow-empty", "-m", "Initial"]);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["remote", "add", "origin", cwd]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["update-ref", "refs/remotes/origin/main", head]);
  const h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "example", uid: repository })), "{}");
  h.store.environment.identity = "test-user";
  await h.seed(recordReferences["claims/housekeep"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "routing"), JSON.stringify({ version: 3, slug: "routing", claimId: "b".repeat(32), createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "errand", purpose: "housekeep-routing", branch: "chore/routing", state: "open", savedHead: null, changeRequest: null }));
  const claims = await acquireStoreClaims(h.store, "test-user");
  expect(claims.kind).toBe("complete");
  const branch = async (name: string, unmerged = false) => {
    await exec("git", ["branch", name]);
    await exec("git", ["config", `branch.${name}.remote`, "origin"]);
    await exec("git", ["config", `branch.${name}.merge`, `refs/heads/${name}`]);
    if (unmerged) {
      await exec("git", ["checkout", name]);
      await writeFile(join(cwd, "unique.txt"), name);
      await exec("git", ["add", "unique.txt"]);
      await exec("git", ["commit", "-m", "Unique work"]);
      await exec("git", ["checkout", "main"]);
    }
  };
  const evidence = { remoteSyncEnabled: true, snapshot: { kind: "available" as const, scope: "all-heads" as const, tips: { main: head } }, objectAvailability: { kind: "complete" as const, commits: { [head]: true } }, history: { kind: "complete" as const } };
  const common = { store: h.store, exec, baseBranch: "main", claims };
  const sweep = (path: "snapshot" | "run", branches: readonly string[], override: OrphanStoreOptions = {}) => path === "snapshot"
    ? analyzeOrphanBranchesSnapshot({ ...common, ...evidence, branches, ...override })
    : runOrphanBranchSweep({ ...common, worktreeIdentity: { kind: "primary" }, errandBranches: null, derivedRoster: [], ...override });
  return { ...h, cwd, exec, head, branch, sweep };
}
it.each(["snapshot", "run"] as const)("%s scans an arbitrary created link using its owning work unit and default project identity", async path => {
  const h = await fixture();
  await h.branch("arbitrary-branch");
  await h.seedMeta("shipped-widget", { state: "Shipped" }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, { branches: [{ repository, ref: "arbitrary-branch", linkedAs: "created", excluded: [] }] });
  const result = await h.sweep(path, ["arbitrary-branch"], { claims: undefined, identity: "test-user" });
  expect(result.orphans, JSON.stringify(result)).toEqual([{ branch: "arbitrary-branch", merged: true, shippedWorkUnit: "shipped-widget", teardown: { text: "arc teardown shipped-widget", argv: ["arc", "teardown", "shipped-widget"] }, actions: [{ text: "arc teardown shipped-widget", argv: ["arc", "teardown", "shipped-widget"] }] }]);
  expect((await h.exec("git", ["rev-parse", "arbitrary-branch"])).stdout.trim()).toBe(h.head);
});
it.each(["snapshot", "run"] as const)("%s keeps adopted cleanup with its owner, whether merged or not", async path => {
  const h = await fixture();
  for (const [branch, unmerged] of [["adopted-landed", false], ["adopted-unique", true]] as const) {
    await h.branch(branch, unmerged);
    await h.seedMeta(branch, { state: "Shipped" }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, { branches: [{ repository, ref: branch, linkedAs: "adopted", excluded: [] }] });
  }
  const result = await h.sweep(path, ["adopted-landed", "adopted-unique"]);
  expect(result.orphans).toEqual([
    { branch: "adopted-landed", merged: true, shippedWorkUnit: null, actions: [{ text: "git branch -D adopted-landed", argv: ["git", "branch", "-D", "adopted-landed"] }] },
    { branch: "adopted-unique", merged: false, shippedWorkUnit: null, actions: [{ text: expect.stringMatching(/its owner.*git branch -D adopted-unique/u) }] },
  ]);
});
it.each([
  { path: "snapshot", linkedAs: "created" }, { path: "snapshot", linkedAs: "adopted" },
  { path: "run", linkedAs: "created" }, { path: "run", linkedAs: "adopted" },
] as const)("$path declines duplicate canonical authority before repairing to a $linkedAs link", async ({ path, linkedAs }) => {
  const h = await fixture(), branch = "topic/ambiguous";
  await h.branch(branch);
  const link = { repository, ref: branch, linkedAs, excluded: [] };
  const primary = await h.seedMeta("shipped-widget", { state: "Shipped" }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, {
    branches: [link, { ...link, ref: `refs/heads/${branch}`, linkedAs: linkedAs === "created" ? "adopted" : "created" }],
  });
  expect(await h.sweep(path, [branch])).toMatchObject({ orphans: [], warnings: [expect.stringMatching(/ambiguous.*repair.*retry/iu)] });
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, links: { branches: [link] }, provenance: { verb: "repair-links", lifecycleAction: "repair-links" } }));
  expect((await h.sweep(path, [branch])).orphans).toEqual([{ branch, merged: true, shippedWorkUnit: linkedAs === "created" ? "shipped-widget" : null,
    ...(linkedAs === "created" ? { teardown: { text: "arc teardown shipped-widget", argv: ["arc", "teardown", "shipped-widget"] } } : {}),
    actions: linkedAs === "created" ? [{ text: "arc teardown shipped-widget", argv: ["arc", "teardown", "shipped-widget"] }]
      : [{ text: `git branch -D ${branch}`, argv: ["git", "branch", "-D", branch] }],
  }]);
  expect((await h.exec("git", ["rev-parse", branch])).stdout.trim()).toBe(h.head);
});
it.each(["snapshot", "run"] as const)("%s excludes active Errands and live grooming claims while ended Errands offer only Git deletion", async path => {
  const h = await fixture();
  const branches = ["chore/open-errand", "chore/ended-errand", "chore/groom-widget"];
  for (const branch of branches) await h.branch(branch);
  for (const [slug, placement] of [["open-errand", { kind: "active" }], ["ended-errand", { kind: "completed", quarter: "2026-q1" }]] as const) {
    await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })), JSON.stringify({ version: 3, slug, claimId: "a".repeat(32), createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "errand", purpose: "errand", intent: "Fix", owner: "test-user", branch: `chore/${slug}`, state: "open", savedHead: null, changeRequest: null, origin: "description", originEntry: null }), placement as never, { branches: [{ repository, ref: `chore/${slug}`, linkedAs: "created", excluded: [] }] });
  }
  await h.seed(recordReferences["claims/groom"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "groom-widget"), JSON.stringify({ version: 3, slug: "groom-widget", claimId: "c".repeat(32), createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", kind: "groom", protection: "full", anchorStub: "widget", members: ["widget"], openedBaseHead: h.head, branch: "chore/groom-widget", state: "open", changeRequest: null }));
  const claims = await acquireStoreClaims(h.store, "test-user");
  expect(claims).toMatchObject({ kind: "complete", diagnostics: [] });
  const result = await h.sweep(path, branches, { claims });
  expect(result.orphans).toEqual([{ branch: "chore/ended-errand", merged: true, shippedWorkUnit: null, actions: [{ text: "git branch -D chore/ended-errand", argv: ["git", "branch", "-D", "chore/ended-errand"] }] }]);
});
it.each(["snapshot", "run"] as const)("%s declines the whole sweep on a failed branch lookup", async path => {
  const h = await fixture();
  await h.branch("unlinked-branch");
  expect(await h.sweep(path, ["unlinked-branch"])).toMatchObject({ orphans: [], warnings: [expect.stringMatching(/not found|No record/iu)] });
});
it.each(["snapshot", "run"] as const)("%s declines incomplete claims independently of branch lookup", async path => {
  const h = await fixture();
  await h.branch("linked-branch");
  await h.seedMeta("widget", {}, { kind: "active" }, { branches: [{ repository, ref: "linked-branch", linkedAs: "created", excluded: [] }] });
  const list = h.store.list.bind(h.store);
  vi.spyOn(h.store, "list").mockImplementation(input => input.family === "claims" ? Promise.resolve({ status: "ok", result: { status: "unreadable", condition: "Claims unavailable", remedy: { text: "Restore claims" } } }) : list(input));
  const claims = await acquireStoreClaims(h.store, "test-user");
  expect(claims.kind).toBe("error");
  expect(await h.sweep(path, ["linked-branch"], { claims })).toMatchObject({ orphans: [], warnings: [expect.stringContaining("Restore claims")] });
});

it.each(["snapshot", "run"] as const)("%s admits the branch retained by the production rename transition writer", async path => {
  const h = await fixture();
  await h.branch("kept-arbitrary-name");
  await h.seedMeta("former-widget", { state: "Shipped" }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, { branches: [{ repository, ref: "kept-arbitrary-name", linkedAs: "created", excluded: [] }] });
  expect(await runStoreRename({ store: h.store, cwd: h.cwd, exec: h.exec, baseBranch: "main", projectId: async () => repository }, { sourceSlug: "former-widget", targetSlug: "renamed-widget" })).toMatchObject({ status: "renamed" });
  const result = await h.sweep(path, ["kept-arbitrary-name"]);
  expect(result.orphans).toEqual([{ branch: "kept-arbitrary-name", merged: true, shippedWorkUnit: "renamed-widget", teardown: { text: "arc teardown renamed-widget", argv: ["arc", "teardown", "renamed-widget"] }, actions: [{ text: "arc teardown renamed-widget", argv: ["arc", "teardown", "renamed-widget"] }] }]);
});

it.each(["snapshot", "run"] as const)("%s declines an absent claims acquisition as incomplete", async path => {
  const h = await fixture();
  await h.branch("linked-branch");
  await h.seedMeta("widget", {}, { kind: "active" }, { branches: [{ repository, ref: "linked-branch", linkedAs: "created", excluded: [] }] });
  const existing = await acquireStoreClaims(h.store, "test-user");
  if (existing.kind !== "complete") throw new Error("Fixture claims must be complete");
  for (const record of existing.records) lifecycleSuccess(await h.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: { verb: "fixture", lifecycleAction: "remove-claim" } }));
  const claims = await acquireStoreClaims(h.store, "test-user");
  expect(claims.kind).toBe("absent");
  expect(await h.sweep(path, ["linked-branch"], { claims })).toMatchObject({ orphans: [], warnings: [expect.stringContaining("not complete")] });
});

it.each(["snapshot", "run"] as const)("%s offers the archived branch holder's UID beside live work", async path => {
  const h = await fixture(), branch = "topic/archived";
  await h.branch(branch);
  const archived = await h.seedMeta("reused", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository, ref: branch, linkedAs: "created", excluded: [] }] });
  const live = await h.seedMeta("reused"), before = lifecycleSuccess(await h.store.version());
  const uid = archived.reference.owner.type === "work-item" ? archived.reference.owner.uid : undefined;
  const teardown = { argv: ["arc", "teardown", uid], text: `arc teardown ${uid}` };
  const result = await h.sweep(path, [branch]);
  expect(result.orphans).toEqual([{ branch, merged: true, shippedWorkUnit: "reused", teardown, actions: [teardown] }]);
  expect(OrphanBranchSweepResultSchema.safeParse(result).success).toBe(true);
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await h.exec("git", ["rev-parse", branch])).stdout.trim()).toBe(h.head);
});
