/** Registered public readers combine Store lifecycle truth with actual local checkout evidence. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker,
  readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
async function fixture() {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness(), project = randomUUID();
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nbranch.protection: full\nteam.mode: false\nsession.remote_sync: disabled\n");
  await exec("git", ["add", ".arc/system/arc-config.yml"]);
  await exec("git", ["commit", "-m", "Initialize reader fixture"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "reader-project", uid: project })), "{}");
  await h.seedMeta("planning-unit", { state: "Planning", currentWorkflow: "draft-design" });
  const paused = await h.seedMeta("paused-unit", { dependsOn: ["planning-unit"], design: ["spec-paused-unit.md"] }, { kind: "active" },
    { branches: [{ repository: project, ref: "feat/paused-unit", linkedAs: "created", excluded: [] }] });
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version,
    content: `${paused.content}\n## Pause\n\n- **Paused By:** \`test-user\`\n- **Since:** \`2026-10-15T00:00:00Z\`\n- **Reason:** Waiting for review\n`,
    placement: { kind: "active" }, links: paused.links, provenance: { verb: "pause", lifecycleAction: "update" } }));
  await h.seed(recordReferences["work-item/spec"](paused.reference.owner), "# Specification: paused-unit\n\n**Purpose:** Read records reliably. More detail follows.\n");
  await exec("git", ["branch", "feat/paused-unit"]);
  const holder = join(cwd, ".arc-checkouts", "anchored-holder");
  await exec("git", ["worktree", "add", holder, "feat/paused-unit"]);
  await ensureWorktreeMarkerIgnored(holder, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(holder, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
    createdFor: { kind: "work-unit", name: "paused-unit" } });
  return { ...h, cwd, exec, holder, project };
}
async function invoke(h: Awaited<ReturnType<typeof fixture>>, argv: readonly string[]) {
  const previousCwd = process.cwd(), previousExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...argv]);
    expect(process.exitCode, output).toBeUndefined();
    return JSON.parse(output);
  } finally { binding.store = null; out.mockRestore(); process.chdir(previousCwd); process.exitCode = previousExit; }
}
it("active in-flight lists branchless Planning and paused work through its default binding without a code remote", async () => {
  const h = await fixture();
  expect((await h.exec("git", ["remote"])).stdout.trim()).toBe("");
  const result = await invoke(h, ["active", "in-flight", "--json"]);
  expect(result).toMatchObject({ remoteEvidence: "not-applicable", candidateExpansion: { status: "not-requested", pendingBranchCount: 0 } });
  expect(result.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "work-unit", name: "planning-unit", state: "Planning", remoteOnly: false }),
    expect.objectContaining({ kind: "work-unit", name: "paused-unit", state: "Active", branch: "feat/paused-unit", scheduling: "paused", worktreePath: h.holder }),
  ]));
  const planning = result.entries.find((entry: { name?: string }) => entry.name === "planning-unit");
  expect(planning).not.toHaveProperty("branch");
}, 30_000);
it("status uses the default anchored-holder lookup and retains lifecycle details beside an unrelated malformed meta warning", async () => {
  const h = await fixture();
  const expected = { slug: "paused-unit", state: "active", owner: "test-user", purpose: "Read records reliably.",
    occupied: true, shipped: false, dependsOn: [{ slug: "planning-unit", landed: false }], integrationBoundary: null, worktreePath: h.holder };
  expect(await invoke(h, ["status", "paused-unit", "--json"])).toMatchObject(expected);
  const broken = await h.seedMeta("broken-unit");
  const stored = [...h.store.state.records.values()].find(record => sameReference(record.reference, broken.reference));
  if (stored === undefined) throw new Error("Missing checked corruption basis");
  stored.content = "Malformed metadata bytes";
  const degraded = await invoke(h, ["status", "paused-unit", "--json"]);
  expect(degraded).toMatchObject({ ...expected, warnings: expect.arrayContaining([expect.stringContaining("broken-unit")]) });
}, 30_000);

it("errand check reports committed and checkout code overlap for paused and branchless work", async () => {
  const h = await fixture();
  const planningHolder = join(h.cwd, ".arc-checkouts", "planning-holder");
  await h.exec("git", ["worktree", "add", "--detach", planningHolder, "main"]);
  await ensureWorktreeMarkerIgnored(planningHolder, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(planningHolder, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
    createdFor: { kind: "work-unit", name: "planning-unit" } });
  await mkdir(join(h.holder, "src"));
  await writeFile(join(h.holder, "src/committed.ts"), "export const committed = true;\n");
  await h.exec("git", ["add", "src/committed.ts"], { cwd: h.holder });
  await h.exec("git", ["commit", "-m", "Change shared code"], { cwd: h.holder });
  await writeFile(join(h.holder, "src/checkout.ts"), "export const checkout = true;\n");
  await mkdir(join(planningHolder, "src"));
  await writeFile(join(planningHolder, "src/planning.ts"), "export const planning = true;\n");
  await h.seedMeta("caller", { state: "Planning", currentWorkflow: "draft-design" });
  await ensureWorktreeMarkerIgnored(h.cwd, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
    createdFor: { kind: "work-unit", name: "caller" } });
  await mkdir(join(h.cwd, "src"));
  await writeFile(join(h.cwd, "src/caller.ts"), "export const caller = true;\n");
  const result = await invoke(h, ["errand", "check", "--target", "src/committed.ts", "src/checkout.ts", "src/planning.ts", "src/caller.ts", "--json"]);
  expect(result.overlaps).toEqual(expect.arrayContaining([
    expect.objectContaining({ workItem: "paused-unit", branch: "feat/paused-unit", worktreePath: h.holder, matchedPaths: ["src/committed.ts", "src/checkout.ts"] }),
    expect.objectContaining({ workItem: "planning-unit", worktreePath: planningHolder, matchedPaths: ["src/planning.ts"] }),
  ]));
  expect(result.overlaps).toHaveLength(2);
  expect(result.indeterminate ?? []).toEqual([]);
}, 30_000);

it("errand check preserves duplicate-holder uncertainty and matches code after the stray claim is released", async () => {
  const h = await fixture();
  const empty = join(h.cwd, ".arc-checkouts", "a-empty-planning"), changed = join(h.cwd, ".arc-checkouts", "b-changed-planning");
  for (const holder of [empty, changed]) {
    await h.exec("git", ["worktree", "add", "--detach", holder, "main"]);
    await ensureWorktreeMarkerIgnored(holder, h.exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeMarker(holder, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
      createdFor: { kind: "work-unit", name: "planning-unit" } });
  }
  await mkdir(join(changed, "src"));
  await writeFile(join(changed, "src/shared.ts"), "export const shared = true;\n");
  const uncertain = await invoke(h, ["errand", "check", "--target", "src/shared.ts", "--json"]);
  expect(uncertain.overlaps).toEqual([]);
  expect(uncertain.skipped ?? []).toContainEqual(expect.objectContaining({ workItem: "planning-unit",
    reason: "entry-location-ambiguous", marks: expect.arrayContaining(["degraded", "location-ambiguous"]) }));
  const warnings = JSON.stringify(uncertain.warnings);
  expect(warnings).toContain(empty); expect(warnings).toContain(changed);
  expect(warnings).toMatch(/release.*stray|stray.*claim/iu);
  const marker = await readWorktreeMarkerGeneration(empty);
  if (marker.kind !== "present") throw new Error("Missing stray marker");
  expect(await removeWorktreeMarkerGeneration(empty, marker.bytes)).toEqual({ kind: "removed" });
  const repaired = await invoke(h, ["errand", "check", "--target", "src/shared.ts", "--json"]);
  expect(repaired.overlaps).toContainEqual(expect.objectContaining({ workItem: "planning-unit", worktreePath: changed, matchedPaths: ["src/shared.ts"] }));
  expect(repaired.skipped ?? []).toEqual([]);
  expect(repaired.indeterminate ?? []).toEqual([]);
}, 30_000);

it.each(["errand", "groom", "housekeep"] as const)("active in-flight and errand check locate a held %s through the registered reader binding", async kind => {
  const h = await fixture(), slug = kind === "groom" ? "groom-alpha" : `held-${kind}`, claimId = "e".repeat(32), branch = `chore/${slug}`;
  h.store.environment.identity = "test-user";
  const person = OwnerIdentitySchema.parse({ type: "person", name: "test-user" });
  const reference = kind === "errand" ? recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }))
    : kind === "groom" ? recordReferences["claims/groom"](person, slug) : recordReferences["claims/housekeep"](person, slug);
  const base = { version: 3, slug, claimId, branch, createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", state: "open", changeRequest: null };
  const content = kind === "errand" ? { ...base, kind: "errand", purpose: "errand", savedHead: null,
    owner: "test-user", intent: "Fix the shared code", origin: "description", originEntry: null }
    : kind === "groom" ? { ...base, kind: "groom", protection: "full", anchorStub: "alpha", members: ["alpha"], openedBaseHead: (await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim() }
    : { ...base, kind: "errand", purpose: "housekeep-routing", savedHead: null };
  await h.seed(reference, JSON.stringify(content), kind === "errand" ? { kind: "active" } : undefined,
    kind === "errand" ? { branches: [{ repository: h.project, ref: branch, linkedAs: "created", excluded: [] }] } : undefined);
  const holder = join(h.cwd, ".arc-checkouts", slug);
  await h.exec("git", ["branch", branch]);
  await h.exec("git", ["worktree", "add", holder, branch]);
  await ensureWorktreeMarkerIgnored(holder, h.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(holder, { spawnedByArc: true, spawningIdentity: "test-user", createdAt: "2026-10-15T00:00:00Z",
    createdFor: { kind, slug, claimId }, provisioning: "ready" });
  await mkdir(join(holder, "src"));
  await writeFile(join(holder, "src/transient.ts"), "export const transient = true;\n");
  const active = await invoke(h, ["active", "in-flight", "--json"]);
  expect(active.entries).toContainEqual(expect.objectContaining({ kind: "errand", slug, branch, worktreePath: holder }));
  const overlap = await invoke(h, ["errand", "check", "--target", "src/transient.ts", "--json"]);
  expect(overlap.overlaps).toContainEqual(expect.objectContaining({ workItem: slug, branch, worktreePath: holder, matchedPaths: ["src/transient.ts"] }));
  expect(overlap.skipped ?? []).toEqual([]);
  expect(overlap.indeterminate ?? []).toEqual([]);
}, 30_000);
