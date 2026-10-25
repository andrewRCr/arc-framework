import { validateLocusEnvelope } from "../../src/commands/locus.js";
/** Registered lifecycle commands distinguish bound checkout generations sharing one name. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
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
