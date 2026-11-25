/** Stops carry only authoritative locus guidance, a relevant failure, and the stop gate. */

import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, baseFrame, forRow, selectedRow, workUnitRow, frameWithRow } from "../../helpers/agenda-fixtures.js";
import { sessionInitFixture } from "../../helpers/session-init-fixtures.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import type { AgendaReadPort } from "../../../src/commands/agenda/compile-input.js";
import type { AgendaAnswers, AgendaSignals, SessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { SessionInitProbeResult } from "../../../src/commands/status.js";

const noReads: AgendaReadPort = {
  exists: async () => { throw new Error("A stop must not inspect files"); },
  size: async () => { throw new Error("A stop must not size files"); },
  read: async () => { throw new Error("A stop must not read files"); },
  git: async () => { throw new Error("A stop must not read Git"); },
};
const stopGate = { type: "gate", kind: "stop", autoProceed: false };

async function compileStop(envelope: SessionInitProbeResult, signals: AgendaSignals = {},
  answers: AgendaAnswers = { answered: {}, done: [] }): Promise<SessionInitAgenda> {
  const result = await compileSessionInitAgenda(createAgendaFixtureInput(envelope, { signals, answers, read: noReads }));
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("Expected an agenda for the stop row");
  return result.agenda;
}

describe("session agenda stops", () => {
  it.each([false, true])("renders unavailable locus guidance with missing identity=%s", async missingIdentity => {
    const envelope = missingIdentity ? await sessionInitFixture({}, { identity: null })
      : await sessionInitFixture({ derivedLocusState: async () => { throw new Error("locus read failed"); } });
    const agenda = await compileStop(envelope, { start: "target", next: true, seed: "source" });
    expect(envelope.locusGuidance.kind).toBe("unavailable");
    if (envelope.locusGuidance.kind !== "unavailable") throw new Error("Expected unavailable guidance");
    expect(agenda.orientation).toEqual({ shape: "none" });
    expect(agenda.steps).toEqual([
      { type: "render", surface: "locus", text: envelope.locusGuidance.message }, stopGate,
    ]);
  });

  it("renders unresolved entering selection verbatim", async () => {
    const frame = baseFrame();
    const envelope = await sessionInitFixture({ derivedLocusState: async () => ({ ...frame,
      entering: { kind: "unresolved", checkoutPath: "/missing", diagnostics: [{ code: "missing", message: "No row" }] } }) });
    const agenda = await compileStop(envelope);
    if (envelope.locusGuidance.kind !== "unavailable") throw new Error("Expected unavailable guidance");
    expect(agenda.steps).toEqual([
      { type: "render", surface: "locus", text: envelope.locusGuidance.message }, stopGate,
    ]);
  });

  it("renders an unresolved checkout's guidance verbatim", async () => {
    const row = selectedRow(baseFrame());
    const envelope = await forRow({ ...row, kind: "unresolved-checkout",
      diagnostics: [{ code: "topology-mismatch", message: "Cannot corroborate" }] });
    const agenda = await compileStop(envelope);
    if (envelope.locusGuidance.kind !== "unavailable") throw new Error("Expected unavailable guidance");
    expect(agenda.steps).toEqual([
      { type: "render", surface: "locus", text: envelope.locusGuidance.message }, stopGate,
    ]);
  });

  it.each(["absent", "null", "failed"] as const)("explains the contextless work unit with %s husk evidence", async husk => {
    const envelope = await forRow(workUnitRow(false, husk !== "absent"), husk);
    const agenda = await compileStop(envelope);
    if (envelope.locusGuidance.kind !== "ready") throw new Error("Expected ready guidance");
    expect(agenda.steps[0]).toMatchObject({ type: "render", surface: "locus" });
    const locus = agenda.steps[0];
    if (locus?.type !== "render") throw new Error("Expected locus rendering");
    expect(locus.text).toContain(envelope.locusGuidance.entering);
    expect(locus.text).toContain("No work-unit context resolves for checkout /repo.");
    expect(agenda.steps.at(-1)).toEqual(stopGate);
    expect(agenda.steps).toHaveLength(husk === "failed" ? 3 : 2);
  });

  it("retains every present ready-guidance line prescribed for the locus surface", async () => {
    const row = { ...workUnitRow(false), diagnostics: [{ code: "context-unavailable", message: "Meta unreadable" }] };
    const frame = frameWithRow(row);
    const envelope = await sessionInitFixture({ derivedLocusState: async () => ({ ...frame,
      primaryAvailability: { kind: "unsafe", checkoutPath: "/repo", reasons: ["not clean"] },
      identityDiscovery: { kind: "error", stage: "tip", message: "Identity tip unavailable" },
    }) });
    const agenda = await compileStop(envelope);
    if (envelope.locusGuidance.kind !== "ready") throw new Error("Expected ready guidance");
    const locus = agenda.steps[0];
    if (locus?.type !== "render") throw new Error("Expected locus rendering");
    for (const line of [envelope.locusGuidance.primaryAvailability, envelope.locusGuidance.identityDiscovery,
      envelope.locusGuidance.entering, ...envelope.locusGuidance.cleanup, ...envelope.locusGuidance.diagnostics]) {
      if (line !== undefined) expect(locus.text).toContain(line);
    }
  });

  it("renders a failed currentHusk with its error kind and message and no action", async () => {
    const envelope = await forRow(workUnitRow(false, true), "failed");
    const agenda = await compileStop(envelope);
    const slot = envelope.currentHusk;
    if (!slot || slot.ok) throw new Error("Expected failed current-husk evidence");
    expect(agenda.steps[1]).toEqual({ type: "render", surface: "degraded-slot",
      text: expect.stringMatching(new RegExp(`currentHusk.*${slot.error.kind}.*${slot.error.message}`, "u")) });
  });

  it("adds no unrelated degraded surfaces, prefix, reads, or signal notes to a stop", async () => {
    const fail = async (): Promise<never> => { throw new Error("unrelated slot failed"); };
    const envelope = await sessionInitFixture({ derivedLocusState: fail, config: fail, user: fail, dirty: fail,
      hooksPath: fail, worktree: fail });
    const signals: AgendaSignals = { context: true, next: true, start: "target", seed: "source" };
    const answers: AgendaAnswers = { answered: { "notes:pull": "decline" }, done: ["notes:load"] };
    const agenda = await compileStop(envelope, signals, answers);
    expect(agenda.signals).toEqual(signals);
    expect(agenda.answers).toEqual(answers);
    expect(agenda.residual).toEqual({ config: envelope.config, releaseRouting: envelope.releaseRouting,
      domainRules: envelope.domainRules, inboxState: envelope.inboxState });
    expect(agenda.steps.map(step => step.type)).toEqual(["render", "gate"]);
    expect(agenda.steps[0]).toMatchObject({ surface: "locus" });
    expect(agenda.orientation).toEqual({ shape: "none" });
  });
});
