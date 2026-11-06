/** State targets use store identity while code targets retain Git probes and marker self-exclusion. */
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { workUnitHoldersFixture } from "../../helpers/store/work-unit-holders.js";
import { claimFrame } from "../../helpers/store/claim-frame.js";
import { expect, it, onTestFinished } from "vitest";
import { runStoreErrandOverlap } from "../../../src/lib/errand/store-overlap.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { ProjectionIndexSchema } from "../../../src/lib/store/projection/index-schema.js";
import { gitBlobId } from "../../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../../src/lib/store/projection/stamp.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeProjectionIndex } from "../../../src/lib/store/projection/index-file.js";
import { PROJECTION_STATE_FOLDER } from "../../../src/lib/store/projection/location.js";

function indexedRecord(path: string, record: StoreRecord) {
  const blob = gitBlobId(record.content, "sha1");
  return ProjectionIndexSchema.parse({ format: 1, state: null, withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null,
    projectedUnder: { view: { mode: "mine", pins: [] }, identity: "alice", claim: null, layoutActive: "nested" },
    entries: { [path]: { kind: "record", reference: record.reference, stat: null,
      written: gitBlobId(renderStampedFile({ content: record.content, stamp: blob }), "sha1"),
      base: { blob, version: record.version }, markers: null, notices: [], unshown: [], protected: false,
      changed: false, pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] } },
  });
}
function frame(subject: { kind: "work-unit"; key: string; uid: string } | { kind: "errand"; key: string; claimId: string }, cwd = "/caller") {
  const row = { kind: subject.kind === "work-unit" ? "work-unit" : "transient", subject, checkout: { path: cwd, head: "a".repeat(40), branch: "main", detached: false, primary: true, folderPresent: true },
    markerGeneration: "marker", parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: "active", diagnostics: [] };
  return DerivedLocusFrameSchema.parse({ roster: [row], entering: { kind: "selected", row }, primaryAvailability: { kind: "occupied", checkoutPath: cwd, subject: row.subject },
    identityDiscovery: { kind: "complete", identities: [], diagnostics: [] }, active: null });
}
it("reports another active work item's state target without code probes and suppresses entry-list targets", async () => {
  const h = createLifecycleHarness(); const caller = await h.seedMeta("caller"); await h.seedMeta("other", { state: "Planning", currentWorkflow: "draft-design" });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main",
    projectId: async () => "project", readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: boundWorkUnitSubject(caller).uid }), targetPaths: [".arc/active/meta-other.md", ".arc/user/alice/USER-INBOX.md", ".arc/backlog/ATOMIC-INBOX.md", ".arc/user/alice/WORKING-MEMORY.md"] });
  expect(result.result).toEqual({ overlaps: [{ workItem: "other", remoteOnly: false, matchedPaths: [".arc/active/meta-other.md"] }] });
});
it("excludes the calling marker's work-item identity, even with no branch", async () => {
  const h = createLifecycleHarness(); const caller = await h.seedMeta("caller");
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  expect((await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main", projectId: async () => "project",
    readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: boundWorkUnitSubject(caller).uid }), targetPaths: [".arc/active/meta-caller.md"] })).result).toEqual({ overlaps: [] });
});

it.each(["file", "primary"])("retains ownership established by the indexed %s despite another work item's name in its physical path", async evidence => {
  const h = createLifecycleHarness(), caller = await h.seedMeta("caller"), alpha = await h.seedMeta("alpha");
  await h.seedMeta("beta");
  const companion = await h.seed(recordReferences["work-item/companion"](alpha.reference.owner, "beta/meta-beta.md"), "literal companion bytes\n");
  const path = ".arc/backlog/planned/alpha/beta/meta-beta.md";
  const cwd = await mkdtemp(join(tmpdir(), "arc-overlap-index-"));
  onTestFinished(async () => { await rm(cwd, { recursive: true, force: true }); });
  const gitDir = join(cwd, ".git"), stateDir = join(gitDir, PROJECTION_STATE_FOLDER);
  await mkdir(stateDir, { recursive: true });
  await writeProjectionIndex({ gitDir, commonDir: gitDir, stateDir, primary: true }, evidence === "file" ? indexedRecord(path, companion)
    : indexedRecord(".arc/backlog/planned/alpha/meta-alpha.md", alpha));
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd, identity: "alice", teamMode: false,
    baseBranch: "main", projectId: async () => "project",
    readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: boundWorkUnitSubject(caller).uid }, cwd), targetPaths: [path] });
  expect(result.result).toEqual({ overlaps: [{ workItem: "alpha", remoteOnly: false, matchedPaths: [path] }] });
});

it("reports an unusable index instead of guessing an indexed path's owner, then resumes after index repair", async () => {
  const h = createLifecycleHarness(), caller = await h.seedMeta("caller"), alpha = await h.seedMeta("alpha");
  await h.seedMeta("beta");
  const companion = await h.seed(recordReferences["work-item/companion"](alpha.reference.owner, "beta/meta-beta.md"), "literal companion bytes\n");
  const path = ".arc/backlog/planned/alpha/beta/meta-beta.md";
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }, { stdout: "" }] }]);
  const options = { store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false,
    baseBranch: "main", projectId: async () => "project",
    readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: boundWorkUnitSubject(caller).uid }), targetPaths: [path] };
  const refused = await runStoreErrandOverlap({ ...options, readIndex: async () => ({ kind: "unusable", cause: "unreadable" }) });
  expect(refused.result).toMatchObject({ overlaps: [], notes: [expect.stringMatching(/index.*unreadable/iu)] });
  expect(refused.result.notes?.join("\n")).toMatch(/repair.*retry/iu);
  const repaired = await runStoreErrandOverlap({ ...options, readIndex: async () => ({ kind: "index", index: indexedRecord(path, companion) }) });
  expect(repaired.result).toEqual({ overlaps: [{ workItem: "alpha", remoteOnly: false, matchedPaths: [path] }] });
});

it("reports missing backlog ownership with a stub remedy instead of probing it as code", async () => {
  const h = createLifecycleHarness(), caller = await h.seedMeta("caller");
  const path = ".arc/backlog/planned/missing/scratch/file.txt";
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false,
    baseBranch: "main", projectId: async () => "project",
    readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: boundWorkUnitSubject(caller).uid }),
    readIndex: async () => ({ kind: "no-projection" }), targetPaths: [path] });
  expect(result.result).toMatchObject({ overlaps: [], notes: [expect.stringContaining("No work-item container is established")] });
  expect(result.result.notes?.join("\n")).toContain("arc stub missing --commitment planned --priority <priority> --class <class>");
});

it("excludes an Errand caller by its exact marker claim instead of the checkout's branch", async () => {
  const h = createLifecycleHarness();
  const { OwnerIdentitySchema, recordReferences } = await import("../../../src/lib/store/identity.js");
  const claimId = "c".repeat(32);
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), JSON.stringify({ version: 3, slug: "fix-it", claimId,
    createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", kind: "errand", purpose: "errand", intent: "Fix", branch: "chore/fix-it", owner: "alice",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }), { kind: "active" });
  const own = frame({ kind: "errand", key: "fix-it", claimId });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  expect((await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main", projectId: async () => "project",
    readFrame: async () => own, targetPaths: [".arc/active/meta-fix-it.md"] })).result).toEqual({ overlaps: [] });
});

it("keeps live in-flight work when the caller holds its completed namesake", async () => {
  const h = await workUnitHoldersFixture(), current = await claimFrame(h.store, h.oldPath);
  const result = await runStoreErrandOverlap({ store: h.store, exec: h.exec, cwd: h.oldPath,
    identity: "test-user", teamMode: false, baseBranch: "main", projectId: async () => "project",
    readFrame: async () => current, targetPaths: [".arc/active/meta-demo.md"] });
  expect(result.result.overlaps).toEqual([{ workItem: "demo", remoteOnly: false, matchedPaths: [".arc/active/meta-demo.md"] }]);
});

it("classifies the checkout's own companion using its flat layout before checking foreign work", async () => {
  const layout = "flat";
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { writeWorktreeOwnershipMarker } = await import("../../../src/lib/git/worktree-marker.js");
  const { createRefStore } = await import("../../../src/lib/store/create.js");
  const { createDefaultRefStorePorts } = await import("../../../src/lib/store/default-ports.js");
  const { beginProjectionCommand } = await import("../../../src/lib/store/projection/process-state.js");
  const cwd = await mkdtemp(join(tmpdir(), "arc-overlap-layout-"));
  onTestFinished(async () => { await rm(cwd, { recursive: true, force: true }); beginProjectionCommand(); });
  const h = createLifecycleHarness(), caller = await h.seedMeta("caller");
  await h.seedMeta("x-caller", { state: "Planning", currentWorkflow: "draft-design" });
  const subject = boundWorkUnitSubject(caller);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true,
    createdFor: { kind: "work-unit", name: "caller", uid: subject.uid }, spawningIdentity: "alice" });
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"), `layout.active: ${layout}\n`);
  createRefStore(createDefaultRefStorePorts({ checkoutRoot: cwd, backingRepository: async () => null }));
  const own = ".arc/active/notes-x-caller.md";
  const other = ".arc/active/in-flight/x-caller/meta-x-caller.md";
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd, identity: "alice", teamMode: false,
    baseBranch: "main", projectId: async () => "project", readFrame: async () => frame({ kind: "work-unit", key: "caller", uid: subject.uid }, cwd),
    targetPaths: [own, other] });
  expect(result.result).toEqual({ overlaps: [{ workItem: "x-caller", remoteOnly: false, matchedPaths: [other] }] });
});
