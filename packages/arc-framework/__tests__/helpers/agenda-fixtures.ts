import { fixtureHuskProof } from "./worktree-husk-fixture.js";
/** Validated session probes and read-bound compiler inputs for agenda tests. */

import { activeSessionInit, derivedFrameFromActive, sessionInitFixture, worktreeSync, type SessionInitProbeOverrides } from "./session-init-fixtures.js";
import type { AgendaCompileInput } from "../../src/commands/agenda/compile-input.js";
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

export async function forRow(row: DerivedCheckoutRow, husk: "absent" | "null" | "failed" | "present" = "absent", branchGone = false, probes: SessionInitProbeOverrides = {}):
Promise<SessionInitProbeResult> {
  return sessionInitFixture({
    derivedLocusState: async () => frameWithRow(row),
    worktreeIdentity: async () => row.checkout.primary ? { kind: "primary" } : { kind: "linked", path: row.checkout.path },
    worktree: async () => worktreeSync({ branch: row.checkout.branch,
      state: branchGone ? "branch-gone" : row.checkout.branch === null ? "detached-head" : "clean" }),
    currentHusk: async () => {
      if (husk === "failed") throw new Error("marker read failed");
      return husk === "present" ? { worktreePath: row.checkout.path, subject: { kind: "work-unit", name: "work" },
        branch: "feat/work", stamp: fixtureHuskProof } : null;
    },
    ...probes,
  });
}

/** Bind a validated probe result to compile inputs that refuse unexpected reads. */
export function createAgendaFixtureInput(
  envelope: SessionInitProbeResult,
  overrides: Partial<Omit<AgendaCompileInput, "envelope">> = {},
): AgendaCompileInput {
  const unexpectedRead = async (): Promise<never> => { throw new Error("Unexpected agenda read"); };
  return { envelope, signals: {}, answers: { answered: {}, done: [] },
    read: { exists: unexpectedRead, size: unexpectedRead, read: unexpectedRead, git: unexpectedRead },
    entry: { cwd: "/repo", identity: envelope.identity.identity, readUserInbox: unexpectedRead,
      io: { exec: unexpectedRead, readFile: unexpectedRead, writeFile: unexpectedRead, mkdir: unexpectedRead,
        readDir: unexpectedRead, writeNote: unexpectedRead, readNote: unexpectedRead } }, ...overrides };
}
