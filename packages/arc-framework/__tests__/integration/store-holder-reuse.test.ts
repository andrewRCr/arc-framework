import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { acquireStoreClaims } from "../../src/lib/errand/store-discovery.js";
import { readOrphanStoreCandidates } from "../../src/lib/session-init/orphan-store-candidates.js";
import { locusOwnsBranch } from "../../src/lib/session-init/locus-classification.js";
import { validateLocusEnvelope } from "../../src/commands/locus.js";
/** Registered lifecycle commands distinguish bound checkout generations sharing one name. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

type Fixture = Awaited<ReturnType<typeof lifecycleReuseFixture>>;
async function checkout(h: Fixture, name: string, record?: StoreRecord) {
  const path = join(h.cwd, ".arc-checkouts", name);
  await h.exec("git", ["worktree", "add", "--detach", path, "main"]);
  await ensureWorktreeMarkerIgnored(path, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(path, { spawnedByArc: false,
    createdFor: record === undefined ? { kind: "work-unit", name: "example" } : boundWorkUnitSubject(record),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return path;
}
async function fixture(backlog = false) {
  const h = await lifecycleReuseFixture(false, { state: "Planning", currentWorkflow: "draft-design" },
    backlog ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  await writeFile(join(h.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const archivedPath = await checkout(h, "archived", h.archived);
  return { ...h, archivedPath, archivedMarker: await readFile(resolveWorktreeMarkerPath(archivedPath)) };
}
async function unchanged(h: Awaited<ReturnType<typeof fixture>>) {
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
  expect(lifecycleSuccess(await h.store.read({ reference: h.oldNotes.reference }))).toEqual(h.oldNotes);
  expect(await readFile(resolveWorktreeMarkerPath(h.archivedPath))).toEqual(h.archivedMarker);
}

it.each(["start", "materialize"] as const)("%s admits the live owner beside an archived holder", async verb => {
  const h = await fixture(verb === "start");
  const result = await repairCli(h, [verb, "example", "--here"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: boundWorkUnitSubject(h.live) } });
  await unchanged(h);
}, 30_000);

it("rename changes only the live owner's bound checkout", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const result = await repairCli(h, ["rename", "example", "renamed"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(await readWorktreeMarker(livePath)).toMatchObject({ kind: "present", marker: { createdFor: boundWorkUnitSubject(h.live, "renamed") } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference })).reference.owner.name).toBe("renamed");
  await unchanged(h);
}, 30_000);

it("status locates the live owner's checkout beside an archived namesake", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const result = await repairCli(h, ["status", "example", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ worktreePath: livePath });
  await unchanged(h);
}, 30_000);

it("named release clears the paused live owner's marker and retains the archived holder", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { content: writeMetaPause(h.live.content,
    { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-24T00:00:00Z", reason: "Waiting", waitsOn: null, resumeNotes: null, open: false }) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const before = lifecycleSuccess(await h.store.read({ reference: h.live.reference }));
  const result = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "released", checkoutPath: livePath });
  expect(await readWorktreeMarker(livePath)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(before);
  await unchanged(h);
}, 30_000);

it("named release selects an unbound creation residue beside a completed bound holder", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ action: "remove", reference: h.live.reference, expected: h.live.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const residuePath = await checkout(h, "residue");
  const result = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "released", checkoutPath: residuePath });
  expect(await readWorktreeMarker(residuePath)).toEqual({ kind: "absent" });
  await unchanged(h);
}, 30_000);

it("named release preserves a lookup clash and offers unnamed release in its checkout", async () => {
  const h = await fixture(), path = await checkout(h, "unbound"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [h.live.reference, other.reference] });
  const before = lifecycleSuccess(await h.store.version()), marker = await readWorktreeMarker(path);
  const refused = await repairCli(h, ["locus", "release", "example", "--json"], { store });
  expect(refused.exitCode).toBe(1);
  expect(refused.result).toMatchObject({ status: "refused", reason: expect.stringContaining("more than one record generation") });
  expect(refused.stdout).toContain("arc locus release");
  expect(await readWorktreeMarker(path)).toEqual(marker);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const released = await repairCli({ ...h, cwd: path }, ["locus", "release", "--json"], { store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await unchanged(h);
}, 30_000);

it("named release requires binding an owned live marker before its normal pause-and-release path", async () => {
  const h = await fixture(), path = await checkout(h, "unbound"), before = lifecycleSuccess(await h.store.version());
  const refused = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toContain("arc materialize example --here");
  expect(refused.stdout).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const bound = await repairCli({ ...h, cwd: path }, ["materialize", "example", "--here"], { store: h.store });
  expect(bound.exitCode ?? 0, bound.stdout + bound.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: { createdFor: boundWorkUnitSubject(h.live) } });
  const paused = await repairCli(h, ["pause", "example", "--reason", "Waiting"], { store: h.store });
  expect(paused.exitCode ?? 0, paused.stdout + paused.stderr).toBe(0);
  const pauseVersion = lifecycleSuccess(await h.store.version());
  const released = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(released.result).toMatchObject({ status: "released", checkoutPath: path });
  expect(await readWorktreeMarker(path)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(pauseVersion);
  await unchanged(h);
}, 30_000);

it("named release refuses two unbound matches and releases the remaining one after unnamed repair", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ action: "remove", reference: h.live.reference, expected: h.live.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const first = await checkout(h, "first"), second = await checkout(h, "second");
  const before = lifecycleSuccess(await h.store.version()), firstMarker = await readWorktreeMarker(first), secondMarker = await readWorktreeMarker(second);
  const refused = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toContain(first);
  expect(refused.stdout).toContain(second);
  expect(refused.stdout).toContain("arc locus release");
  expect(await readWorktreeMarker(first)).toEqual(firstMarker);
  expect(await readWorktreeMarker(second)).toEqual(secondMarker);
  expect((await repairCli({ ...h, cwd: first }, ["locus", "release", "--json"], { store: h.store })).exitCode ?? 0).toBe(0);
  expect(await readWorktreeMarker(first)).toEqual({ kind: "absent" });
  expect(await readWorktreeMarker(second)).toEqual(secondMarker);
  const released = await repairCli(h, ["locus", "release", "example", "--json"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(released.result).toMatchObject({ status: "released", checkoutPath: second });
  expect(await readWorktreeMarker(second)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await unchanged(h);
}, 30_000);

it.each([false, true])("releases a free slug's marker and creates that slug afterward, named=%s", async named => {
  const h = await fixture(), path = await checkout(h, "free");
  await writeWorktreeMarker(path, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "fresh" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const before = lifecycleSuccess(await h.store.version()), head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout;
  const released = await repairCli(named ? h : { ...h, cwd: path }, ["locus", "release", ...(named ? ["fresh"] : []), "--json"], { store: h.store });
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toEqual({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const created = await repairCli({ ...h, cwd: path }, ["start", "fresh", "--new", "--here", "--yes"], { store: h.store });
  expect(created.exitCode ?? 0, created.stdout + created.stderr).toBe(0);
  const primary = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("fresh") })).reference;
  if (primary.owner.type === "person") throw new Error("Expected work-unit identity");
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: { createdFor: { name: "fresh", uid: primary.owner.uid } } });
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout).toBe(head);
  expect(lifecycleSuccess(await h.store.read({ reference: h.live.reference }))).toEqual(h.live);
  await unchanged(h);
}, 30_000);

it("keeps bound archived and live checkouts independent in the derived roster", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const result = await repairCli(h, ["locus", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const envelope = validateLocusEnvelope(result.result);
  if (!envelope.ok) throw new Error(envelope.error.message);
  const roster = envelope.roster;
  expect(roster.find(row => row.checkout.path === livePath)).toMatchObject({ kind: "work-unit",
    subject: { uid: boundWorkUnitSubject(h.live).uid }, context: { sessionType: "planning" } });
  expect(roster.every(row => row.diagnostics.every(item => item.code !== "work-unit-locus-conflict"))).toBe(true);
  await unchanged(h);
}, 30_000);

it("status selects the live position while the archived holder retains an unlanded integration checkout", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const configPath = join(h.cwd, ".arc/system/arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8")).replace(/^archive.cadence:.*$/mu, "archive.cadence: with-integration"));
  await writeFile(join(h.archivedPath, "archived-work.txt"), "Unlanded archived work\n");
  await h.exec("git", ["add", "archived-work.txt"], { cwd: h.archivedPath });
  await h.exec("git", ["commit", "-m", "Retain archived work"], { cwd: h.archivedPath });
  const result = await repairCli(h, ["status", "example", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ worktreePath: livePath, derivedPosition: { checkoutPath: livePath, sessionType: "planning" } });
  await unchanged(h);
}, 30_000);

it("keeps the live branch orphan candidate until its own checkout appears", async () => {
  const h = await fixture(), branch = "topic/live";
  await h.exec("git", ["branch", branch]);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { links: { branches: [
    { repository: h.repository, ref: branch, linkedAs: "created", excluded: [] },
  ] } }), provenance: { verb: "link", lifecycleAction: "link" } }));
  await h.seed(recordReferences["claims/housekeep"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "routing"),
    JSON.stringify({ version: 3, slug: "routing", claimId: "b".repeat(32), createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z",
      kind: "errand", purpose: "housekeep-routing", branch: "chore/routing", state: "open", savedHead: null, changeRequest: null }));
  const claims = await acquireStoreClaims(h.store, "test-user");
  const options = { store: h.store, projectId: async () => h.repository, claims };
  const roster = async () => {
    const output = await repairCli(h, ["locus", "--json"], { store: h.store });
    const envelope = validateLocusEnvelope(output.result);
    if (!envelope.ok) throw new Error(envelope.error.message);
    return envelope.roster;
  };
  const before = await roster();
  expect(await readOrphanStoreCandidates(options, [branch], before)).toMatchObject({ status: "ready", candidates: [
    { branch, authority: { record: { reference: { owner: { uid: boundWorkUnitSubject(h.live).uid } } } } },
  ] });
  expect(await locusOwnsBranch(before, branch, options)).toBe(false);
  const livePath = await checkout(h, "live", h.live);
  await h.exec("git", ["switch", branch], { cwd: livePath });
  const after = await roster();
  expect(await readOrphanStoreCandidates(options, [branch], after)).toEqual({ status: "ready", candidates: [] });
  expect(await locusOwnsBranch(after, branch, options)).toBe(true);
  await unchanged(h);
}, 30_000);

it("in-flight reports only the live owner's checkout beside the archived bound holder", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const result = await repairCli(h, ["active", "in-flight", "--json"], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ entries: [{ kind: "work-unit", name: "example",
    uid: boundWorkUnitSubject(h.live).uid, worktreePath: livePath }] });
  await unchanged(h);
}, 30_000);

it("release in the archived checkout offers that holder's teardown by UID", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const liveMarker = await readFile(resolveWorktreeMarkerPath(livePath));
  const before = lifecycleSuccess(await h.store.version());
  const result = await repairCli({ ...h, cwd: h.archivedPath }, ["locus", "release", "--json"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.result).toEqual({ status: "refused", reason: `The work unit has ended; run arc teardown ${boundWorkUnitSubject(h.archived).uid}.` });
  expect(await readFile(resolveWorktreeMarkerPath(livePath))).toEqual(liveMarker);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await unchanged(h);
}, 30_000);

it("materialize in the archived checkout offers that holder's teardown by UID", async () => {
  const h = await fixture(), livePath = await checkout(h, "live", h.live);
  const liveMarker = await readFile(resolveWorktreeMarkerPath(livePath));
  const before = lifecycleSuccess(await h.store.version());
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.archivedPath })).stdout;
  const result = await repairCli({ ...h, cwd: h.archivedPath }, ["materialize", "example", "--here"], { store: h.store });
  expect(result.exitCode).toBe(1);
  expect(result.stderr + result.stdout).toContain(`arc teardown ${boundWorkUnitSubject(h.archived).uid}`);
  expect(result.stderr + result.stdout).not.toContain("arc teardown example");
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: h.archivedPath })).stdout).toBe(head);
  expect(await readFile(resolveWorktreeMarkerPath(livePath))).toEqual(liveMarker);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await unchanged(h);
}, 30_000);
