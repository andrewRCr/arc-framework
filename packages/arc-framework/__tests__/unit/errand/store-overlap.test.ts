/** State targets use store identity while code targets retain Git probes and marker self-exclusion. */
import { expect, it } from "vitest";
import { runStoreErrandOverlap } from "../../../src/lib/errand/store-overlap.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
function frame(self = "caller") {
  const row = { kind: "work-unit", subject: { kind: "work-unit", key: self }, checkout: { path: "/caller", head: "a".repeat(40), branch: "main", detached: false, primary: true, folderPresent: true },
    markerGeneration: "marker", parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: "active", diagnostics: [] };
  return DerivedLocusFrameSchema.parse({ roster: [row], entering: { kind: "selected", row }, primaryAvailability: { kind: "occupied", checkoutPath: "/caller", subject: row.subject },
    identityDiscovery: { kind: "complete", identities: [], diagnostics: [] }, active: null });
}
it("reports another active work item's state target without code probes and suppresses entry-list targets", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("caller"); await h.seedMeta("other", { state: "Planning", currentWorkflow: "draft-design" });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const result = await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main",
    projectId: async () => "project", readFrame: async () => frame(), targetPaths: [".arc/active/meta-other.md", ".arc/user/alice/USER-INBOX.md", ".arc/backlog/ATOMIC-INBOX.md", ".arc/user/alice/WORKING-MEMORY.md"] });
  expect(result.result).toEqual({ overlaps: [{ workItem: "other", remoteOnly: false, matchedPaths: [".arc/active/meta-other.md"] }] });
});
it("excludes the calling marker's work-item identity, even with no branch", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("caller");
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  expect((await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main", projectId: async () => "project",
    readFrame: async () => frame(), targetPaths: [".arc/active/meta-caller.md"] })).result).toEqual({ overlaps: [] });
});

it("excludes an Errand caller by its exact marker claim instead of the checkout's branch", async () => {
  const h = createLifecycleHarness();
  const { OwnerIdentitySchema, recordReferences } = await import("../../../src/lib/store/identity.js");
  const claimId = "c".repeat(32);
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), JSON.stringify({ version: 3, slug: "fix-it", claimId,
    createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", kind: "errand", purpose: "errand", intent: "Fix", branch: "chore/fix-it", owner: "alice",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }), { kind: "active" });
  const previous = frame(); const row = { ...previous.roster[0]!, kind: "transient", subject: { kind: "errand", key: "fix-it", claimId } };
  const own = DerivedLocusFrameSchema.parse({ ...previous, roster: [row], entering: { kind: "selected", row } });
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  expect((await runStoreErrandOverlap({ store: h.store, exec: fake.exec, cwd: "/caller", identity: "alice", teamMode: false, baseBranch: "main", projectId: async () => "project",
    readFrame: async () => own, targetPaths: [".arc/active/meta-fix-it.md"] })).result).toEqual({ overlaps: [] });
});
