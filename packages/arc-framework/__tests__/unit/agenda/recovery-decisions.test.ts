/** Recovery dispatch follows the recommendation, including conservative dirty-probe fallback. */
import type { AgendaAnswers } from "../../../src/commands/agenda/schema.js";
import { describe, expect, it } from "vitest";
import { compileRecoveryDecision } from "../../../src/commands/agenda/recovery-decisions.js";
import { inferBranchGoneRecovery } from "../../../src/lib/session-init/recommended-action.js";
import { SessionInitRecoveryValueSchema, type CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";

const candidate = { branch: "feat/recover", proposedAction: "switch" } as const;
const recordedAnswers: AgendaAnswers[] = [
  { answered: { "branch-gone:resolved": "accept" }, done: [] },
  { answered: { "branch-gone:resolved": "decline" }, done: [] },
  { answered: {}, done: ["branch-gone:resolved"] },
];
describe("recovery recommendation dispatch", () => {
  it("honors the producer's prompt recommendation when dirty state is unavailable", () => {
    const recovery = SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery({ kind: "resolved",
      remoteEvidence: "exact", candidate }, { state: "dirty", fileCount: 0 }));
    const decision = compileRecoveryDecision({ recovery, signals: {}, answers: { answered: {}, done: [] },
      destinations: [{ branch: candidate.branch, kind: "free", actions: [
        { argv: ["git", "switch", candidate.branch], text: `git switch ${candidate.branch}` },
      ] }] });
    expect(decision).toMatchObject({ type: "offer", id: "branch-gone:resolved", ask: "now",
      text: recovery.recommendedPromptText, choices: [expect.objectContaining({ kind: "actions" }),
        { kind: "bare", label: "Stay here", decline: true }] });
  });

  it.each(recordedAnswers)("holds a recovery whose question or execution is already recorded: %j", answers => {
    const recovery = SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery({ kind: "resolved",
      remoteEvidence: "exact", candidate }, { state: "clean", fileCount: 0 }));
    expect(compileRecoveryDecision({ recovery, signals: {}, answers, destinations: [
      { branch: candidate.branch, kind: "free", actions: [{ argv: ["git", "switch", candidate.branch], text: "Switch" }] },
    ] })).toBeNull();
  });

  it("holds an answered pending refresh while evidence remains pending", () => {
    const recovery = SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery({ kind: "pending",
      remoteEvidence: "pending-fetch", candidates: [], pendingBranchCount: 1,
      refreshRemedy: { argv: ["arc", "active", "in-flight", "--json"], text: "Refresh evidence" },
    }, { state: "clean", fileCount: 0 }));
    expect(compileRecoveryDecision({ recovery, signals: {}, destinations: [],
      answers: { answered: { "branch-gone:pending": "accept" }, done: [] } })).toBeNull();
  });

  it("asks the new recovery kind after a pending refresh resolves its evidence", () => {
    const recovery = SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery({ kind: "resolved",
      remoteEvidence: "exact", candidate }, { state: "dirty", fileCount: 1 }));
    expect(compileRecoveryDecision({ recovery, signals: {},
      answers: { answered: { "branch-gone:pending": "accept" }, done: [] }, destinations: [
        { branch: candidate.branch, kind: "free", actions: [{ argv: ["git", "switch", candidate.branch], text: "Switch" }] },
      ] })).toMatchObject({ type: "offer", id: "branch-gone:resolved", ask: "now" });
  });

  it.each([
    { kind: "resolved", remoteEvidence: "exact", candidate: {
      proposedAction: "external", branch: "feat/external", worktreePath: "/wt/external",
    } },
    { kind: "unproven", remoteEvidence: "pending-fetch", candidates: [
      { proposedAction: "external", branch: "feat/external", worktreePath: "/wt/external" },
    ] },
  ] satisfies CascadeResolution[])("holds surface-only $kind recovery without an offer", raw => {
    const recovery = SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery(raw, { state: "clean", fileCount: 0 }));
    expect(compileRecoveryDecision({ recovery, signals: {}, answers: { answered: {}, done: [] }, destinations: [] })).toBeNull();
  });

});
