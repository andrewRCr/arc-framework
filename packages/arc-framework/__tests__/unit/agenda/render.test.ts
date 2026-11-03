/** Locus narration retains every declared field without repeating the entering header. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { sessionInitFixture } from "../../helpers/session-init-fixtures.js";
import { LocusSessionGuidanceSchema } from "../../../src/lib/locus/session-guidance.js";
import { renderReadyLocusLines } from "../../../src/commands/agenda/render.js";
import { compileUnconsumedSignals } from "../../../src/commands/agenda/orientation.js";

describe("agenda locus and invocation narration", () => {
  it("retains all optional ready guidance and excludes entering outside a stop", () => {
    const guidance = LocusSessionGuidanceSchema.parse({ kind: "ready", currentFrame: "Current frame", primaryAvailability: "Availability",
      recovery: "Recovery", reconciliation: "Reconciliation", entering: "Entering checkout", pause: "Pause", identityDiscovery: "Discovery",
      identities: ["Identity"], cleanup: ["Cleanup"], diagnostics: ["Diagnostic"] });
    if (guidance.kind !== "ready") throw new Error("Expected ready guidance");
    const lines = renderReadyLocusLines(guidance);
    expect(lines).toEqual(expect.arrayContaining(["Current frame", "Availability", "Recovery", "Reconciliation", "Pause", "Discovery", "Identity", "Cleanup", "Diagnostic"]));
    expect(lines).toHaveLength(9);
    expect(lines).not.toContain("Entering checkout");
    expect(renderReadyLocusLines(guidance, true)).toEqual(expect.arrayContaining(["Entering checkout"]));
  });

  it("reports unconsumed next and start while omitting consumed intent", async () => {
    const value = createAgendaFixtureInput(await sessionInitFixture(), { signals: { seed: "Fresh concern", next: true, start: "target" } });
    const steps = compileUnconsumedSignals(value, { seed: true });
    expect(steps).toEqual([
      { type: "note", surface: "unconsumed-signal", text: "--next auto-proceeds only a work-unit resume." },
      { type: "note", surface: "unconsumed-signal", text: "Run arc-session --start 'target' on its own to vet that launch." },
    ]);
  });
});
