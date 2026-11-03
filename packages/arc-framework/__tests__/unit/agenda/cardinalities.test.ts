/** Runtime constraints over the compiled agenda's complete instruction order. */

import { describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";

const failed = { ok: false, error: { kind: "runtime", message: "Unavailable" } };
const stop = { type: "gate", kind: "stop", autoProceed: false };
const note = { type: "note", surface: "warning", text: "Inspect this condition." };
const then = { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json"] };
const exec = { type: "exec", id: "notes:pull", actions: [{ text: "Pull notes", argv: ["arc", "user", "pull"] }], then };
const read = (group: number) => ({ type: "read", path: "README.md", readMode: { kind: "full" }, group });
const bare = { kind: "bare", label: "Skip", decline: true };
const accept = { kind: "actions", label: "Accept", accepts: ["notes:pull"], actions: exec.actions, then };
const clear = { kind: "signal", label: "Decline", signal: "plan", value: null, decline: true, recompile: then.argv };
const offer = (choices: unknown[], ask = "now") => ({ type: "offer", id: "notes:pull", text: "Pull?", ask, choices });
const agenda = (steps: unknown[]) => ({
  schemaVersion: 1, mode: "agenda", ceremony: "session-init", signals: {},
  answers: { answered: {}, done: [] }, orientation: { shape: "none" },
  residual: { config: failed, releaseRouting: failed, domainRules: failed }, steps,
});

describe("agenda runtime cardinalities", () => {
  it("requires at least one step", () => {
    expect(() => assertSessionInitAgenda(agenda([stop]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([]))).toThrow();
  });

  it("allows at most one gate, only at the end", () => {
    expect(() => assertSessionInitAgenda(agenda([note, stop]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([stop, stop]))).toThrow();
    expect(() => assertSessionInitAgenda(agenda([stop, note]))).toThrow();
  });

  it("requires execution to terminate the current agenda", () => {
    expect(() => assertSessionInitAgenda(agenda([note, exec]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([exec, stop]))).toThrow();
  });

  it("keeps read groups non-decreasing across intervening steps", () => {
    expect(() => assertSessionInitAgenda(agenda([read(0), note, read(0), read(1), stop]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([read(1), note, read(0), stop]))).toThrow();
  });

  it("requires two choices and exactly one valid decline for an immediate offer", () => {
    expect(() => assertSessionInitAgenda(agenda([offer([accept, bare]), stop]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([accept, clear])]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([accept], "orientation"), stop]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([bare]), stop]))).toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([accept, accept]), stop]))).toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([bare, clear]), stop]))).toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([accept, { ...clear, value: true }]), stop]))).toThrow();
  });

  it("closes only on a gate, execution, workflow handoff, or fully recompiling immediate offer", () => {
    const workflow = { type: "fragment", target: { kind: "workflow", path: ".arc/system/workflows/arc/draft-design.md" }, args: {} };
    expect(() => assertSessionInitAgenda(agenda([workflow]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([accept, clear])]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([offer([{ ...accept, then: { kind: "handoff" } }, clear])]))).not.toThrow();
    for (const step of [note, read(0), offer([accept, bare]), offer([accept], "orientation"),
      { ...workflow, target: { kind: "method", name: "read-load-set" } }]) {
      expect(() => assertSessionInitAgenda(agenda([step]))).toThrow();
    }
  });

  it("enables auto-proceed only on a proceed gate", () => {
    expect(() => assertSessionInitAgenda(agenda([{ ...stop, kind: "proceed", autoProceed: true }]))).not.toThrow();
    expect(() => assertSessionInitAgenda(agenda([{ ...stop, autoProceed: true }]))).toThrow();
    expect(() => assertSessionInitAgenda(agenda([{ ...stop, kind: "launch", autoProceed: true }]))).toThrow();
  });

});
