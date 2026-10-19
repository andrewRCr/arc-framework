/** Lifecycle lookup fails closed on marker and topology uncertainty. */
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createLocusPorts } from "../../../src/lib/locus/lifecycle-ports.js";
import { writeWorktreeOwnershipMarker, resolveWorktreeMarkerPath, stampWorktreeHusk, readWorktreeMarker, removeWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-locus-ports-"));
  const other = join(cwd, "holder");
  await mkdir(other);
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const store = createReferenceFixture().store;
  const exec = async () => ({ stdout: [
    `worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "", "",
    `worktree ${other}`, `HEAD ${"b".repeat(40)}`, "branch refs/heads/feat/demo", "", "",
  ].join("\0") });
  const ports = createLocusPorts({ cwd, exec, store });
  return { cwd, other, ports, marker: () => writeWorktreeOwnershipMarker(other, { createdByArc: true,
    createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "andrew", now: 0 }) };
}

it("refuses another checkout's marker and returns its holder rather than invoking the legacy scan", async () => {
  const h = await fixture();
  await h.marker();
  expect(await h.ports.checkMarkerExclusivity({ name: "demo" })).toMatchObject({ kind: "refused", checkoutPath: h.other,
    reason: expect.stringContaining("arc locus release") });
  expect(await h.ports.findHoldingCheckout({ name: "demo", resolveLegacy: async () => { throw new Error("Legacy read"); } })).toBe(h.other);
});

it("refuses an unreadable unrelated marker and carries its diagnostic and inspection repair", async () => {
  const h = await fixture();
  await h.marker();
  await writeFile(resolveWorktreeMarkerPath(h.other), "not JSON");
  const result = await h.ports.checkMarkerExclusivity({ name: "other" });
  expect(result).toMatchObject({ kind: "refused", reason: expect.stringContaining("malformed JSON") });
  if (result.kind !== "refused") throw new Error("Expected refusal");
  expect(result.reason).toContain(h.other);
  expect(result.reason).toContain("inspect");
  await expect(h.ports.findHoldingCheckout({ name: "other", resolveLegacy: async () => null })).rejects.toThrow("malformed JSON");
});

it("admits its own marker explicitly and finds none for a different work unit", async () => {
  const h = await fixture();
  await h.marker();
  expect(await h.ports.checkMarkerExclusivity({ name: "demo", checkoutPath: h.other })).toEqual({ kind: "clear" });
  expect(await h.ports.checkMarkerExclusivity({ name: "other" })).toEqual({ kind: "clear" });
  expect(await h.ports.findHoldingCheckout({ name: "other", resolveLegacy: async () => "/incorrect" })).toBeNull();
});

it.each(["failed", "incomplete"])("refuses a %s roster for both operations", async kind => {
  const h = await fixture();
  const ports = createLocusPorts({ cwd: h.cwd, store: createReferenceFixture().store,
    exec: async () => { if (kind === "failed") throw new Error("Git listing failed"); return { stdout: "" }; } });
  expect(await ports.checkMarkerExclusivity({ name: "demo" })).toMatchObject({ kind: "refused", reason: expect.stringContaining("Git lists") });
  await expect(ports.findHoldingCheckout({ name: "demo", resolveLegacy: async () => null })).rejects.toThrow("Git lists");
});

it("rejects duplicate holders and passes over a husk-stamped marker", async () => {
  const h = await fixture();
  await h.marker();
  await writeWorktreeOwnershipMarker(h.cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "andrew", now: 0 });
  await expect(h.ports.findHoldingCheckout({ name: "demo", resolveLegacy: async () => null })).rejects.toThrow(h.other);
  await stampWorktreeHusk(h.other, { sha: "a".repeat(40), at: new Date(0).toISOString(), subject: { kind: "work-unit", name: "demo" }, branch: "feat/demo" });
  expect(await h.ports.findHoldingCheckout({ name: "demo", resolveLegacy: async () => null })).toBe(h.cwd);
});

it.each(["primary", "linked"])("writes, replaces and rolls back exact anchored generations on the %s checkout", async topology => {
  const h = await fixture();
  const checkout = topology === "primary" ? h.cwd : h.other;
  const marker = { spawnedByArc: false, createdFor: { kind: "work-unit" as const, name: "demo" },
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
