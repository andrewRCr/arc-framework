/** Recovery actions preserve the decision boundary and exact refresh argv. */
import { describe, expect, it } from "vitest";
import { inferBranchGoneRecovery } from "../../../src/lib/session-init/recommended-action.js";
import { SessionInitRecoveryValueSchema, type CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";

const clean = { state: "clean", fileCount: 0 } as const;
const dirty = { state: "dirty", fileCount: 1 } as const;
const candidate = { branch: "feat/recover", proposedAction: "switch" } as const;

describe("branch recovery actions", () => {
  it("offers the exact pending discovery refresh", () => {
    const refreshRemedy = { text: "Refresh discovery", argv: ["arc", "active", "in-flight", "--json"] as ["arc", "active", "in-flight", "--json"] };
    const result = inferBranchGoneRecovery({ kind: "pending", remoteEvidence: "pending-fetch", candidates: [], pendingBranchCount: 1, refreshRemedy }, clean);
    expect(result.actions).toEqual([refreshRemedy]);
    expect(SessionInitRecoveryValueSchema.safeParse(result).success).toBe(true);
  });
  it("names a switch checkout as text", () => {
    const result = inferBranchGoneRecovery({ kind: "resolved", remoteEvidence: "exact", candidate: { ...candidate, worktreePath: "/wt/recover" } }, clean);
    expect(result.actions).toEqual([{ text: expect.stringContaining("/wt/recover") }]);
    expect(result.recommendedAction).toBe("switch");
    expect(result.recommendedPromptText).toBe("");
  });
  it("gives an exact clean branch switch as text with any fetch prerequisite", () => {
    const result = inferBranchGoneRecovery({ kind: "resolved", remoteEvidence: "exact", candidate }, clean);
    expect(result.actions).toEqual([{ text: expect.stringContaining("git switch feat/recover") }]);
    expect(result.actions?.[0]?.text).toContain("fetch");
  });
  it.each([
    { kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" },
    { kind: "surface", remoteEvidence: "exact", candidates: [candidate, { ...candidate, branch: "feat/other" }] },
    { kind: "unproven", remoteEvidence: "unreachable", failureReason: "network", candidates: [] },
    { kind: "resolved", remoteEvidence: "exact", candidate: { ...candidate, proposedAction: "external", worktreePath: "/wt/external" } },
    { kind: "resolved", remoteEvidence: "exact", candidate: { ...candidate, proposedAction: "removable", worktreePath: "/wt/retired" } },
    { kind: "resolved", remoteEvidence: "exact", candidate },
  ] satisfies CascadeResolution[])("preserves the composed decision text for $kind", (resolution) => {
    const result = inferBranchGoneRecovery(resolution, dirty);
    expect(result.actions).toEqual([{ text: result.recommendedPromptText }]);
    expect(SessionInitRecoveryValueSchema.safeParse(result).success).toBe(true);
  });
});
