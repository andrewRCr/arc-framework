/** Compiled agenda steps preserve their closed wire contract. */

import { describe, it } from "vitest";
import { AgendaStepSchema, OfferChoiceSchema, SessionInitAgendaSchema } from "../../../src/commands/agenda/schema.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

const action = { text: "Refresh notes", argv: ["arc", "user", "pull"] };
const then = { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json"] };
const steps = [
  { type: "read", path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" }, group: 0 },
  { type: "exec", id: "notes:pull", actions: [action], then },
  { type: "offer", id: "notes:pull", ask: "orientation", text: "Refresh notes?", choices: [{ kind: "bare", label: "Skip" }] },
  { type: "fragment", target: { kind: "method", name: "read-load-set" }, args: { identity: null } },
  { type: "render", surface: "notes", text: "Notes are ahead.", marker: { path: "/repo/.arc/nudge", value: "today" } },
  { type: "note", surface: "dirty", text: "Uncommitted changes." },
  { type: "gate", kind: "proceed", autoProceed: false },
];
const choices = [
  { kind: "bare", label: "Skip", decline: true },
  { kind: "actions", label: "Pull", accepts: ["notes:pull"], actions: [action], then },
  { kind: "signal", label: "Housekeep", signal: "housekeep", value: true, recompile: then.argv },
  { kind: "elicit", label: "Name an errand", signal: "errand", carried: "fix", recompile: then.argv },
];

describe("agenda step wire shapes", () => {
  for (const step of steps) {
    it(`accepts a ${step.type} step and rejects an unknown field`, () => {
      assertSchemaAccepts(AgendaStepSchema, step);
      assertSchemaRefuses(AgendaStepSchema, { ...step, unexpected: true });
    });
  }
  for (const choice of choices) {
    it(`accepts a ${choice.kind} choice and rejects an unknown field`, () => {
      assertSchemaAccepts(OfferChoiceSchema, choice);
      assertSchemaRefuses(OfferChoiceSchema, { ...choice, unexpected: true });
    });
  }

  it("requires the cursor exactly for strategic partial reads", () => {
    const read = { type: "read", path: ".arc/active/tasks-example.md", group: 0 };
    const anchor = { id: "1.1", title: "Build the contract", lineHint: 12 };
    const cursor = { section: anchor, leaf: anchor };
    assertSchemaAccepts(AgendaStepSchema, { ...read, readMode: { kind: "partial-strategic" }, cursor });
    assertSchemaRefuses(AgendaStepSchema, { ...read, readMode: { kind: "partial-strategic" } });
    assertSchemaRefuses(AgendaStepSchema, { ...read, readMode: { kind: "full" }, cursor });
    assertSchemaRefuses(AgendaStepSchema, { ...read, readMode: { kind: "partial-section", heading: "Context" }, cursor });
  });

  it("requires a non-negative integer read group", () => {
    const read = { type: "read", path: "README.md", readMode: { kind: "full" } };
    assertSchemaAccepts(AgendaStepSchema, { ...read, group: 0 });
    assertSchemaAccepts(AgendaStepSchema, { ...read, group: 2 });
    for (const group of [-1, 0.5]) assertSchemaRefuses(AgendaStepSchema, { ...read, group });
  });
});

const failed = { ok: false, error: { kind: "runtime", message: "Unavailable" } };
const agenda = {
  schemaVersion: 1, mode: "agenda", ceremony: "session-init", signals: {},
  answers: { answered: {}, done: [] }, orientation: { shape: "none" },
  residual: { config: failed, releaseRouting: failed, domainRules: failed },
  steps: [{ type: "gate", kind: "stop", autoProceed: false }],
};

describe("agenda document vocabulary", () => {
  it("accepts the versioned envelope and rejects unknown fields at every authored boundary", () => {
    assertSchemaAccepts(SessionInitAgendaSchema, agenda);
    assertSchemaRefuses(SessionInitAgendaSchema, { ...agenda, unexpected: true });
    for (const key of ["signals", "answers", "orientation", "residual"] as const) {
      assertSchemaRefuses(SessionInitAgendaSchema, { ...agenda, [key]: { ...agenda[key], unexpected: true } });
    }
  });

  it("carries only declared signal values and recorded answer values", () => {
    const signals = { seed: "spec-example.md", plan: true, errand: "fix", next: true,
      isolate: true, start: "example", housekeep: true, context: true };
    assertSchemaAccepts(SessionInitAgendaSchema, { ...agenda, signals,
      answers: { answered: { "notes:pull": "decline" }, done: ["notes:load"] } });
    assertSchemaRefuses(SessionInitAgendaSchema, { ...agenda, signals: { next: false } });
    assertSchemaRefuses(SessionInitAgendaSchema, { ...agenda, answers: { answered: { "notes:pull": "maybe" }, done: [] } });
  });

  it("represents each orientation shape and a nullable transient subject key", () => {
    for (const orientation of [{ shape: "work-state" }, { shape: "checkout" }, { shape: "none" },
      { shape: "subject", subject: { kind: "errand", key: null } }]) {
      assertSchemaAccepts(SessionInitAgendaSchema, { ...agenda, orientation });
    }
    assertSchemaRefuses(SessionInitAgendaSchema, { ...agenda, orientation: { shape: "subject" } });
  });
});
