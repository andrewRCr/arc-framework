/** Session entry precedence is decided from validated, composed probe fixtures. */

import { describe, expect, it } from "vitest";
import { sessionInitFixture, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { baseFrame, selectedRow, forRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { resolveAgendaRow } from "../../../src/commands/agenda/row.js";
import type { AgendaSignals } from "../../../src/commands/agenda/schema.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

const intent: AgendaSignals = { errand: true, next: true, isolate: true, start: "target", seed: "source" };

describe("session agenda row precedence", () => {
  it("stops on failed locus authority before branch recovery or intent", async () => {
    const envelope = await sessionInitFixture({ derivedLocusState: async () => { throw new Error("locus denied"); },
      worktree: async () => worktreeSync({ state: "branch-gone" }) });
    expect(resolveAgendaRow(envelope, intent)).toBe("stop");
  });

  it("stops on missing identity", async () => {
    expect(resolveAgendaRow(await sessionInitFixture({ worktree: async () => worktreeSync({ state: "branch-gone" }) }, { identity: null }), intent)).toBe("stop");
  });

  it("stops on unresolved entering selection", async () => {
    const frame = baseFrame();
    const envelope = await sessionInitFixture({ derivedLocusState: async () => ({ ...frame,
      entering: { kind: "unresolved", checkoutPath: "/missing", diagnostics: [] } }),
      worktree: async () => worktreeSync({ state: "branch-gone" }) });
    expect(resolveAgendaRow(envelope, intent)).toBe("stop");
  });

  it("stops on an unresolved checkout", async () => {
    const row = selectedRow(baseFrame());
    expect(resolveAgendaRow(await forRow({ ...row, kind: "unresolved-checkout", diagnostics: [
      { code: "topology-mismatch", message: "No corroborated role" },
    ] }, "absent", true), intent)).toBe("stop");
  });

  it.each(["absent", "null", "failed"] as const)("stops on a contextless WU with %s husk evidence", async husk => {
    const envelope = await forRow(workUnitRow(false, husk !== "absent"), husk, husk === "absent");
    if (husk === "absent") expect(envelope.currentHusk).toBeUndefined();
    if (husk === "failed") expect(envelope.currentHusk).toMatchObject({ ok: false });
    expect(resolveAgendaRow(envelope, intent)).toBe("stop");
  });

  it("accepts a non-null husk as a contextless WU's entry arm", async () => {
    expect(resolveAgendaRow(await forRow(workUnitRow(false, true), "present"), {})).toBe("current-husk");
  });

  it.each([{}, { errand: true }, { housekeep: true }, { plan: true }, { context: true }, { start: "target" }] as AgendaSignals[])(
    "selects branch-gone before lower-priority intent %j", async signals => {
      const envelope = await sessionInitFixture({ worktree: async () => worktreeSync({ state: "branch-gone" }) });
      expect(resolveAgendaRow(envelope, signals)).toBe("branch-gone");
    },
  );

  it.each(["errand", "housekeep", "plan", "context"] as const)("selects %s before focused recon", async signal => {
    expect(resolveAgendaRow(await sessionInitFixture(), { [signal]: true, start: "target" })).toBe(signal);
  });

  it("selects focused recon before the entering work unit", async () => {
    expect(resolveAgendaRow(await forRow(workUnitRow()), { start: "target" })).toBe("start");
  });

  it("resumes the entering work unit", async () => {
    expect(resolveAgendaRow(await forRow(workUnitRow()), {})).toBe("work-unit");
  });

  it("resumes an entering transient", async () => {
    const row = selectedRow(baseFrame());
    expect(resolveAgendaRow(await forRow({ ...row, kind: "transient",
      subject: { kind: "partial-errand", key: "concern", claimId: null } }), {})).toBe("transient");
  });

  it("selects cold-start for a branched unmanaged linked checkout", async () => {
    const row = selectedRow(baseFrame());
    expect(resolveAgendaRow(await forRow({ ...row, kind: "unmanaged-checkout", subject: null,
      checkout: { ...row.checkout, path: "/linked", primary: false, branch: "feat/unmanaged" } }), {})).toBe("cold-start");
  });

  it.each(["free-primary", "unmanaged-checkout", "retired"] as const)("orients the remaining %s row", async kind => {
    const row = selectedRow(baseFrame());
    const selected: DerivedCheckoutRow = kind === "retired" ? { ...row, kind,
      subject: { kind: "work-unit", key: "retired" } } : { ...row, kind, subject: null };
    expect(resolveAgendaRow(await forRow(selected), {})).toBe("orient");
  });
});
