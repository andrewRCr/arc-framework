/** Lifecycle lookup fails closed on marker and topology uncertainty. */
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { ownerHolderRequest } from "../../../src/lib/work-unit/locus-ports.js";
import { createLocusPorts } from "../../../src/lib/locus/lifecycle-ports.js";
import { writeWorktreeMarker, writeWorktreeOwnershipMarker, resolveWorktreeMarkerPath, stampWorktreeHusk, readWorktreeMarker, removeWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-locus-ports-"));
  const other = join(cwd, "holder");
  await mkdir(other);
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("demo");
  const exec = async () => ({ stdout: [
    `worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "", "",
    `worktree ${other}`, `HEAD ${"b".repeat(40)}`, "branch refs/heads/feat/demo", "", "",
  ].join("\0") });
  const ports = createLocusPorts({ cwd, exec, store });
  return { cwd, other, ports, record, store, marker: () => writeWorktreeOwnershipMarker(other, { createdByArc: true,
    createdFor: boundWorkUnitSubject(record), spawningIdentity: "andrew", now: 0 }) };
}

it("refuses another checkout's marker and returns its holder rather than invoking the legacy scan", async () => {
  const h = await fixture();
  await h.marker();
  const result = await h.ports.checkMarkerExclusivity({ ...ownerHolderRequest(h.record) });
  expect(result).toMatchObject({ kind: "refused", checkoutPath: h.other,
    reason: expect.stringContaining("arc locus release") });
  if (result.kind !== "refused") throw new Error("Expected occupied checkout");
  expect(result.reason).toContain(h.other);
  expect(result.reason).toContain("arc pause demo --reason <text>");
  expect(result.reason).not.toContain("arc locus release demo");
  expect(await h.ports.findHoldingCheckout({ ...ownerHolderRequest(h.record), resolveLegacy: async () => { throw new Error("Legacy read"); } })).toEqual({ kind: "held", path: h.other });
});

it("refuses an unreadable unrelated marker and carries its diagnostic and inspection repair", async () => {
  const h = await fixture();
  await h.marker();
  await writeFile(resolveWorktreeMarkerPath(h.other), "not JSON");
  const result = await h.ports.checkMarkerExclusivity({ kind: "creation", slug: "other" });
  expect(result).toMatchObject({ kind: "refused", reason: expect.stringContaining("malformed JSON") });
  if (result.kind !== "refused") throw new Error("Expected refusal");
  expect(result.reason).toContain(h.other);
  expect(result.reason).toContain("inspect");
  await expect(h.ports.findHoldingCheckout({ kind: "creation", slug: "other", resolveLegacy: async () => null })).rejects.toThrow("malformed JSON");
});

it("admits its own marker explicitly and finds none for a different work unit", async () => {
  const h = await fixture();
  await h.marker();
  expect(await h.ports.checkMarkerExclusivity({ ...ownerHolderRequest(h.record), checkoutPath: h.other })).toEqual({ kind: "clear" });
  expect(await h.ports.checkMarkerExclusivity({ kind: "creation", slug: "other" })).toEqual({ kind: "clear" });
  expect(await h.ports.findHoldingCheckout({ kind: "creation", slug: "other", resolveLegacy: async () => "/incorrect" })).toEqual({ kind: "none" });
});

it.each(["failed", "incomplete"])("refuses a %s roster for both operations", async kind => {
  const h = await fixture();
  const ports = createLocusPorts({ cwd: h.cwd, store: createReferenceFixture().store,
    exec: async () => { if (kind === "failed") throw new Error("Git listing failed"); return { stdout: "" }; } });
  expect(await ports.checkMarkerExclusivity({ ...ownerHolderRequest(h.record) })).toMatchObject({ kind: "refused", reason: expect.stringContaining("Git lists") });
  await expect(ports.findHoldingCheckout({ ...ownerHolderRequest(h.record), resolveLegacy: async () => null })).rejects.toThrow("Git lists");
});

it("rejects duplicate holders and passes over a husk-stamped marker", async () => {
  const h = await fixture();
  await h.marker();
  await writeWorktreeOwnershipMarker(h.cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(h.record), spawningIdentity: "andrew", now: 0 });
  await expect(h.ports.findHoldingCheckout({ ...ownerHolderRequest(h.record), resolveLegacy: async () => null })).rejects.toThrow(h.other);
  await stampWorktreeHusk(h.other, { sha: "a".repeat(40), at: new Date(0).toISOString(), subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo" });
  expect(await h.ports.findHoldingCheckout({ ...ownerHolderRequest(h.record), resolveLegacy: async () => null })).toEqual({ kind: "held", path: h.cwd });
});

it.each(["primary", "linked"])("writes, replaces and rolls back exact anchored generations on the %s checkout", async topology => {
  const h = await fixture();
  const checkout = topology === "primary" ? h.cwd : h.other;
  const marker = { spawnedByArc: false, createdFor: boundWorkUnitSubject(h.record),
    spawningIdentity: "andrew", createdAt: new Date(0).toISOString() };
  const ports = createLocusPorts({ cwd: h.cwd, store: createReferenceFixture().store,
    exec: async () => ({ stdout: join(h.cwd, ".git", "info", "exclude") }) });
  const created = await ports.writeAnchoredMarker(checkout, marker);
  expect(created.kind).toBe("created");
  expect(await readWorktreeMarker(checkout)).toEqual({ kind: "present", marker });
  expect(await readFile(join(h.cwd, ".git", "info", "exclude"), "utf8")).toContain("worktree-marker.json");
  expect(await ports.writeAnchoredMarker(checkout, { ...marker, spawningIdentity: "other" })).toEqual({ kind: "exists" });
  expect(await readWorktreeMarker(checkout)).toEqual({ kind: "present", marker });
  if (created.kind !== "created") throw new Error("Expected generation");
  expect(await ports.writeAnchoredMarker(checkout, marker, { expected: Buffer.from("other") })).toEqual({ kind: "generation-mismatch" });
  const next = { ...marker, spawningIdentity: "other" };
  const replaced = await ports.writeAnchoredMarker(checkout, next, { expected: created.bytes });
  expect(replaced.kind).toBe("replaced");
  expect(await removeWorktreeMarkerGeneration(checkout, created.bytes)).toEqual({ kind: "generation-mismatch" });
  expect(await readWorktreeMarker(checkout)).toEqual({ kind: "present", marker: next });
  if (replaced.kind !== "replaced") throw new Error("Expected replacement");
  expect(await removeWorktreeMarkerGeneration(checkout, replaced.bytes)).toEqual({ kind: "removed" });
  expect(await readWorktreeMarker(checkout)).toEqual({ kind: "absent" });
});

it.each([false, true])("reports an unbound owner holder through its current or former name, former=%s", async former => {
  const h = await fixture();
  let primary = h.record;
  if (former) {
    const { recordPut } = await import("../../../src/lib/store/lifecycle-write.js");
    const { SlugSchema } = await import("../../../src/lib/kernel/index.js");
    const { lifecycleSuccess } = await import("../../helpers/store/lifecycle-harness.js");
    lifecycleSuccess(await h.store.write({ ...recordPut(primary), action: "put", content: primary.content.replaceAll("demo", "current"),
      reference: { ...primary.reference, owner: { ...primary.reference.owner, name: SlugSchema.parse("current") } },
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    primary = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  }
  await writeWorktreeOwnershipMarker(h.other, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user", now: 0 });
  const request = ownerHolderRequest(primary);
  const found = await h.ports.findHoldingCheckout(request);
  expect(found).toMatchObject({ kind: "unbound", path: h.other, exits: [
    { argv: ["arc", "materialize", former ? "current" : "demo", "--here"], checkout: h.other },
    { argv: ["arc", "locus", "release"], checkout: h.other } ], reason: expect.stringContaining("unbound") });
  const exclusive = await h.ports.checkMarkerExclusivity(request);
  expect(exclusive).toMatchObject({ kind: "refused", checkoutPath: h.other,
    unbound: { kind: "unbound", path: h.other }, reason: expect.stringContaining("arc locus release") });
  expect(JSON.stringify(found)).toContain(request.uid);
});
it("refuses a bound owner holder beside an unbound namesake and names both checkouts and exits", async () => {
  const h = await fixture();
  await h.marker();
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  const request = ownerHolderRequest(h.record);
  await expect(h.ports.findHoldingCheckout(request)).rejects.toThrow(h.cwd);
  await expect(h.ports.findHoldingCheckout(request)).rejects.toThrow(h.other);
  await expect(h.ports.findHoldingCheckout(request)).rejects.toThrow("arc materialize demo --here");
  const exclusive = await h.ports.checkMarkerExclusivity(request);
  expect(exclusive).toMatchObject({ kind: "refused", reason: expect.stringContaining(h.cwd) });
  expect(JSON.stringify(exclusive)).toContain(h.other);
  expect(JSON.stringify(exclusive)).toContain("arc locus release");
});
it("excludes an unbound entering checkout from both owner holder queries", async () => {
  const h = await fixture();
  await writeWorktreeOwnershipMarker(h.other, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user", now: 0 });
  const request = { ...ownerHolderRequest(h.record), checkoutPath: h.other };
  expect(await h.ports.findHoldingCheckout(request)).toEqual({ kind: "none" });
  expect(await h.ports.checkMarkerExclusivity(request)).toEqual({ kind: "clear" });
});
