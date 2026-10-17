/** Missing registrations resolve branch creation authority through repository-qualified store links. */
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";
import { expect, it, vi } from "vitest";
import { readMissingWorktreeFolders } from "../../../src/lib/session-init/missing-worktree-folders.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { DerivedCheckoutRowSchema } from "../../../src/lib/locus/derived-schema.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
function row(branch: string | null, locked: string | null = null) {
  return DerivedCheckoutRowSchema.parse({ kind: "unmanaged-checkout", subject: null, checkout: { path: "/missing", branch, head: "a".repeat(40), detached: branch === null, primary: false, folderPresent: false, locked },
    markerGeneration: null, parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: null, diagnostics: [] });
}
const exec = async () => ({ stdout: worktreePorcelainZ(`worktree /missing
HEAD ${"a".repeat(40)}
branch refs/heads/topic/arbitrary`), stderr: "" });
const lockedExec = async () => ({ stdout: worktreePorcelainZ(`worktree /missing
HEAD ${"a".repeat(40)}
branch refs/heads/topic/adopted
locked owner lock`), stderr: "" });
it("offers teardown only for an ended work item's created branch, independent of its spelling", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: "project", ref: "topic/arbitrary", linkedAs: "created", excluded: [] }] });
  const reports = await readMissingWorktreeFolders({ store: h.store, projectId: async () => "project", rows: [row("topic/arbitrary")], shipped: new Set(), exec, folderExists: async () => false });
  expect(reports[0]?.actions).toEqual([{ text: "arc teardown shipped", argv: ["arc", "teardown", "shipped"] }]);
});
it("keeps adopted registration cleanup as text with unlocking first", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: "project", ref: "topic/adopted", linkedAs: "adopted", excluded: [] }] });
  const reports = await readMissingWorktreeFolders({ store: h.store, projectId: async () => "project", rows: [row("topic/adopted", "owner lock")], shipped: new Set(), exec: lockedExec,
    folderExists: async () => false });
  expect(reports[0]?.actions).toEqual([{ text: expect.stringMatching(/unlock.*remove/u) }]);
  expect(reports[0]?.actions[0]?.text).not.toContain("teardown");
});
it("suppresses branched registrations without project identity but retains detached removal", async () => {
  const h = createLifecycleHarness(), warnings: string[] = [];
  const reports = await readMissingWorktreeFolders({ store: h.store, rows: [row("topic/unknown"), row(null)], shipped: new Set(), warnings, exec, folderExists: async () => false });
  expect(reports).toHaveLength(1); expect(reports[0]?.branch).toBeNull(); expect(warnings.join(" ")).toContain("identity");
});

it("defaults the branch lookup repository to the project's identity record", async () => {
  const h = createLifecycleHarness(), project = "00000000-0000-4000-8000-000000000001";
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "example", uid: project })), "{}");
  await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: project, ref: "topic/arbitrary", linkedAs: "created", excluded: [] }] });
  const lookup = vi.spyOn(h.store, "lookup");
  const reports = await readMissingWorktreeFolders({ store: h.store, rows: [row("topic/arbitrary")], shipped: new Set(), exec, folderExists: async () => false });
  expect(lookup).toHaveBeenCalledWith({ kind: "ref", repository: project, ref: "topic/arbitrary" });
  expect(reports[0]?.actions[0]?.argv).toEqual(["arc", "teardown", "shipped"]);
});
it("suppresses one refused branch lookup and carries its repair in warnings", async () => {
  const h = createLifecycleHarness(), warnings: string[] = [];
  vi.spyOn(h.store, "lookup").mockResolvedValue({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item", condition: "Branch authority is unreadable", remedy: { text: "Repair branch authority" } } });
  const reports = await readMissingWorktreeFolders({ store: h.store, projectId: async () => "project", rows: [row("topic/arbitrary")], shipped: new Set(), warnings, exec, folderExists: async () => false });
  expect(reports).toEqual([]); expect(warnings).toEqual(["Branch authority is unreadable Repair branch authority"]);
});

it("withholds cleanup for a conflicted primary and restores teardown after repair", async () => {
  const h = createLifecycleHarness(), warnings: string[] = [];
  const saved = await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: "project", ref: "topic/arbitrary", linkedAs: "created", excluded: [] }] });
  const read = h.store.read.bind(h.store);
  const conflict = recordReferences["work-item/conflict-record"](saved.reference.owner, "unresolved");
  const conflicted = vi.spyOn(h.store, "read").mockImplementation(async input => {
    const result = await read(input);
    return result.status === "ok" && result.result.reference.kind === "work-item/meta"
      ? { status: "ok", result: { ...result.result, conflicts: [conflict] } } : result;
  });
  const options = { store: h.store, projectId: async () => "project", rows: [row("topic/arbitrary")],
    shipped: new Set<string>(), warnings, exec, folderExists: async () => false };
  expect(await readMissingWorktreeFolders(options)).toEqual([]);
  expect(warnings.join(" ")).toMatch(/conflict.*repair/iu);
  conflicted.mockRestore();
  expect((await readMissingWorktreeFolders(options))[0]?.actions[0]?.argv).toEqual(["arc", "teardown", "shipped"]);
});

it.each([false, true])("withholds ambiguous canonical links regardless of order, then accepts repair (reverse=%s)", async reverse => {
  const h = createLifecycleHarness(), warnings: string[] = [];
  const links = [{ repository: "project", ref: "topic/arbitrary", linkedAs: "created" as const, excluded: [] },
    { repository: "project", ref: "refs/heads/topic/arbitrary", linkedAs: "adopted" as const, excluded: [] }];
  if (reverse) links.reverse();
  const saved = await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, { branches: links });
  const options = { store: h.store, projectId: async () => "project", rows: [row("topic/arbitrary")],
    shipped: new Set<string>(), warnings, exec, folderExists: async () => false };
  expect(await readMissingWorktreeFolders(options)).toEqual([]);
  expect(warnings.join(" ")).toMatch(/ambiguous.*repair/iu);
  const fixed = await h.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content,
    links: { branches: [{ repository: "project", ref: "topic/arbitrary", linkedAs: "created", excluded: [] }] },
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "repair", lifecycleAction: "repair" } });
  expect(fixed.status).toBe("ok");
  expect((await readMissingWorktreeFolders(options))[0]?.actions[0]?.argv).toEqual(["arc", "teardown", "shipped"]);
});
