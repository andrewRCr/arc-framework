/** Coherent entering rows passed through the shared session-init fixture. */

import { activeSessionInit, derivedFrameFromActive, sessionInitFixture, worktreeSync } from "./session-init-fixtures.js";
import type { DerivedLocusFrame } from "../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../src/lib/locus/derived-roster.js";
import type { SessionInitProbeResult } from "../../src/commands/status.js";

export function baseFrame(): DerivedLocusFrame {
  return derivedFrameFromActive(activeSessionInit(), "andrew", null, null);
}

export function selectedRow(frame: DerivedLocusFrame): DerivedCheckoutRow {
  if (frame.entering.kind !== "selected") throw new Error("Expected a selected fixture row");
  return frame.entering.row;
}

export function frameWithRow(row: DerivedCheckoutRow): DerivedLocusFrame {
  const primary = selectedRow(baseFrame());
  const roster = row.checkout.primary ? [row] : [primary, row];
  const active = row.kind === "work-unit" && row.subject.kind === "work-unit" && row.context !== null
    ? { checkoutPath: row.checkout.path, subject: row.subject, context: row.context } : null;
  return {
    roster, entering: { kind: "selected", row }, active, identityDiscovery: { kind: "absent" },
    primaryAvailability: row.checkout.primary && row.subject !== null
      ? { kind: "occupied", checkoutPath: row.checkout.path, subject: row.subject }
      : { kind: "free", checkoutPath: primary.checkout.path },
  };
}

export function workUnitRow(context = true, detached = false): DerivedCheckoutRow {
  const frame = derivedFrameFromActive(activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md",
    sessionType: "execution" }), "andrew", null, null);
  const row = selectedRow(frame);
  return { ...row, context: context ? row.context : null,
    checkout: { ...row.checkout, primary: !detached, detached, branch: detached ? null : "feat/work" } };
}

export async function forRow(row: DerivedCheckoutRow, husk: "absent" | "null" | "failed" | "present" = "absent", branchGone = false):
Promise<SessionInitProbeResult> {
  return sessionInitFixture({
    derivedLocusState: async () => frameWithRow(row),
    worktreeIdentity: async () => row.checkout.primary ? { kind: "primary" } : { kind: "linked", path: row.checkout.path },
    worktree: async () => worktreeSync({ branch: row.checkout.branch,
      state: branchGone ? "branch-gone" : row.checkout.branch === null ? "detached-head" : "clean" }),
    currentHusk: async () => {
      if (husk === "failed") throw new Error("marker read failed");
      return husk === "present" ? { worktreePath: row.checkout.path, subject: { kind: "work-unit", name: "work" },
        branch: "feat/work", stamp: { kind: "legacy", authorization: "merged-preserved" } } : null;
    },
  });
}
