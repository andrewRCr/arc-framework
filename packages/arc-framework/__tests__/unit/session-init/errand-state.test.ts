/** Session-level Errand resume and residue actions. */
import { describe, expect, it } from "vitest";
import { runErrandState, type RunErrandStateOptions } from "../../../src/lib/session-init/errand-state.js";
import type { TransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";

const options: RunErrandStateOptions = {
  exec: async () => { throw new Error("unexpected Git read"); },
  currentBranch: "chore/fix-typo", hasBackingMeta: false, includeDiscovery: false, entries: null,
  records: [{ version: 3, slug: "fix-typo", claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00Z", updatedAt: "2026-07-21T00:00:00Z",
    kind: "errand", purpose: "errand", intent: "fix typo", branch: "chore/fix-typo",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null,
  } as TransientIdentityRecord],
  recordsComplete: true, remoteTips: new Map(), baseBranch: "main", staleThresholdDays: 3,
  nudge: { shouldNudge: false, markerPath: "/repo/nudge", today: "2026-07-21" },
};
describe("Errand session actions", () => {
  it("offers the current Errand's resume as text, even without discovery", async () => {
    const result = await runErrandState(options);
    expect(result.resume).toMatchObject({ resumable: true, actions: [{ text: expect.stringMatching(/resume.*fix-typo/i) }] });
    expect(result.resume.actions?.[0]).not.toHaveProperty("argv");
  });
  it.each(["no-record-or-meta", "errand-record-without-branch", "classification-unavailable"] as const)(
    "explains residue %s with its branch and slug", async (reason) => {
      const result = await runErrandState({ ...options, residue: [{ branch: "chore/leftover", slug: "leftover", reason }] });
      expect(result.residue[0]).toMatchObject({ actions: [{ text: expect.stringContaining("chore/leftover") }] });
      expect(result.residue[0]?.actions?.[0]?.text).toContain("leftover");
      expect(result.residue[0]?.actions?.[0]).not.toHaveProperty("argv");
    });
  it("keeps a non-Errand branch quiet", async () => {
    const result = await runErrandState({ ...options, currentBranch: "main" });
    expect(result.resume).not.toHaveProperty("actions");
  });
});
