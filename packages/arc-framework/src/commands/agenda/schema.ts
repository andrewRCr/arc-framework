/** Runtime vocabulary for compiled session initialization agendas. */

import { z } from "zod";
import { ConfigSessionInitResultSchema } from "../config/status.js";
import { DomainRulesSessionInitResultSchema } from "../constitution/status.js";
import { probe } from "../status/types.js";
import { LoadSetPathSchema, ReadModeSchema } from "../../lib/load-set/types.js";
import { ReleaseRoutingValueSchema } from "../../lib/release/routing.js";
import { SessionActionSchema } from "../../lib/session-init/actions.js";
import { InboxStateResultSchema } from "../../lib/session-init/inbox-state.js";
import { assertSessionEnvelopeContract } from "../../lib/session-envelope/validation.js";
import { TaskListCursorSchema } from "../../lib/task-list/cursor.js";

const argv = z.array(z.string()).min(1);
const then = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("recompile"), argv: argv.describe("Run these arguments as a fresh agenda.") }),
  z.strictObject({ kind: z.literal("handoff") }),
]);
const marker = z.strictObject({
  path: z.string().describe("Write this marker only after its orientation text has been emitted."),
  value: z.string().describe("Exact marker contents."),
});

/** An executable published action with literal command arguments. */
export const ExecutableActionSchema = SessionActionSchema.extend({
  argv: argv.describe("Execute directly as argument elements, without reparsing."),
});
const actions = z.array(ExecutableActionSchema).min(1);

/** One choice offered to the person entering a session. */
export const OfferChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("bare"), label: z.string(), decline: z.literal(true).optional(),
  }),
  z.strictObject({
    kind: z.literal("actions"), label: z.string(),
    accepts: z.array(z.string()).describe("Question keys this choice accepts."),
    actions, then,
  }),
  z.strictObject({
    kind: z.literal("signal"), label: z.string(),
    signal: z.enum(["plan", "errand", "start", "housekeep", "context"]),
    value: z.union([z.string(), z.literal(true), z.null()]).describe("Set the signal, or clear it with null."),
    decline: z.literal(true).optional(), recompile: argv,
  }),
  z.strictObject({
    kind: z.literal("elicit"), label: z.string(), signal: z.enum(["errand", "plan"]),
    carried: z.string().optional().describe("Offer this default when eliciting the signal's value."),
    recompile: argv.describe("Insert the elicited --signal and literal answer before any -- delimiter, otherwise at the end; bind a leading-dash answer as --signal=answer."),
  }),
]);

/** One context document, retaining the shared read and cursor vocabulary. */
export const AgendaReadStepSchema = z.strictObject({
  type: z.literal("read"), path: LoadSetPathSchema.describe("Context document to read."),
  readMode: ReadModeSchema.describe("Required reading discipline."),
  group: z.number().int().nonnegative().describe("Non-negative read group; groups execute sequentially."),
  cursor: TaskListCursorSchema.optional().describe("Required exactly for a strategic partial read."),
}).refine((read) => (read.readMode.kind === "partial-strategic") === (read.cursor !== undefined), {
  message: "A cursor must be present exactly for a strategic partial read",
  path: ["cursor"],
});

/** One ordered instruction in a compiled agenda. */
export const AgendaStepSchema = z.discriminatedUnion("type", [
  AgendaReadStepSchema,
  z.strictObject({ type: z.literal("exec"), id: z.string(), actions, then }),
  z.strictObject({
    type: z.literal("offer"), id: z.string(), ask: z.enum(["now", "orientation"]),
    text: z.string().describe("Present verbatim at the specified question boundary."),
    choices: z.array(OfferChoiceSchema),
  }),
  z.strictObject({
    type: z.literal("fragment"),
    target: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("method"), name: z.string() }),
      z.strictObject({ kind: z.literal("workflow"), path: z.string() }),
    ]),
    args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
  z.strictObject({ type: z.literal("render"), surface: z.string(), text: z.string(), marker: marker.optional() }),
  z.strictObject({ type: z.literal("note"), surface: z.string(), text: z.string(), marker: marker.optional() }),
  z.strictObject({ type: z.literal("gate"), kind: z.enum(["proceed", "launch", "stop"]), autoProceed: z.boolean() }),
]);

/** Ordered instruction in a compiled agenda. */
export type AgendaStep = z.infer<typeof AgendaStepSchema>;
/** Choice offered to the session's operator. */
export type OfferChoice = z.infer<typeof OfferChoiceSchema>;

/** Complete compiled session initialization document. */
export const SessionInitAgendaSchema = z.strictObject({
  schemaVersion: z.literal(1), mode: z.literal("agenda"), ceremony: z.literal("session-init"),
  signals: z.strictObject({
    seed: z.string().optional(), plan: z.union([z.string(), z.literal(true)]).optional(),
    errand: z.union([z.string(), z.literal(true)]).optional(), next: z.literal(true).optional(),
    isolate: z.literal(true).optional(), start: z.string().optional(), housekeep: z.literal(true).optional(),
    context: z.literal(true).optional(),
  }).describe("Signals received for this invocation, without inferring extra intent."),
  answers: z.strictObject({
    answered: z.record(z.string(), z.enum(["accept", "decline"])),
    done: z.array(z.string()).describe("Completed action ids and followed method fragment ids."),
  }).describe("Recorded decisions carried through recompilation."),
  orientation: z.discriminatedUnion("shape", [
    z.strictObject({ shape: z.literal("work-state") }),
    z.strictObject({ shape: z.literal("subject"), subject: z.strictObject({
      kind: z.enum(["errand", "partial-errand", "groom", "housekeep", "work-unit"]), key: z.string().nullable(),
    }) }),
    z.strictObject({ shape: z.literal("checkout") }),
    z.strictObject({ shape: z.literal("none") }),
  ]).describe("The final orientation's subject; none suppresses orientation."),
  residual: z.strictObject({
    config: probe(ConfigSessionInitResultSchema), releaseRouting: probe(ReleaseRoutingValueSchema),
    domainRules: probe(DomainRulesSessionInitResultSchema), inboxState: probe(InboxStateResultSchema).optional(),
  }).describe("Unchanged probe slots retained for session judgment and rule consumption."),
  steps: z.array(AgendaStepSchema).min(1).describe("Execute in order; mutations recompile or hand off."),
});

/** Complete compiled session initialization document. */
export type SessionInitAgenda = z.infer<typeof SessionInitAgendaSchema>;
/** Invocation intent carried into recompilation. */
export type AgendaSignals = SessionInitAgenda["signals"];
/** Decisions and completed actions carried into recompilation. */
export type AgendaAnswers = SessionInitAgenda["answers"];
/** Frame used for the final session orientation. */
export type AgendaOrientation = SessionInitAgenda["orientation"];

/** Validate the compiled document before emission without replacing its object. */
export function assertSessionInitAgenda(value: unknown): asserts value is SessionInitAgenda {
  assertSessionEnvelopeContract("session-init-agenda", SessionInitAgendaRuntimeSchema, value);
}

const SessionInitAgendaRuntimeSchema = SessionInitAgendaSchema.superRefine((agenda, context) => {
  validateStepOrder(agenda.steps, context);
  for (const [index, step] of agenda.steps.entries()) {
    if (step.type === "offer" && step.ask === "now") validateImmediateOffer(step, index, context);
    if (step.type === "gate" && step.autoProceed && step.kind !== "proceed") {
      context.addIssue({ code: "custom", path: ["steps", index], message: "Only a proceed gate can auto-proceed" });
    }
  }
});

function validateStepOrder(steps: AgendaStep[], context: z.RefinementCtx): void {
  let group = -1;
  let gateCount = 0;
  for (const [index, step] of steps.entries()) {
    const path = ["steps", index];
    if ((step.type === "gate" || step.type === "exec") && index !== steps.length - 1) {
      context.addIssue({ code: "custom", path, message: `${step.type} must be the last step` });
    }
    if (step.type === "gate") gateCount += 1;
    if (step.type === "read") {
      if (step.group < group) context.addIssue({ code: "custom", path, message: "Read groups must not decrease" });
      group = step.group;
    }
  }
  if (gateCount > 1) context.addIssue({ code: "custom", path: ["steps"], message: "At most one gate is allowed" });
  const last = steps[steps.length - 1];
  if (!last || !isTerminalStep(last)) {
    context.addIssue({ code: "custom", path: ["steps"], message: "An agenda must end on a session boundary" });
  }
}

function isTerminalStep(step: AgendaStep): boolean {
  switch (step.type) {
    case "gate": case "exec": return true;
    case "fragment": return step.target.kind === "workflow";
    case "offer": return step.ask === "now" && step.choices.every(choice => choice.kind !== "bare");
    case "read": case "render": case "note": return false;
  }
}

function validateImmediateOffer(
  step: Extract<AgendaStep, { type: "offer" }>,
  index: number,
  context: z.RefinementCtx,
): void {
  const declines = step.choices.filter(choice => "decline" in choice && choice.decline);
  const decline = declines[0];
  const validDecline = decline?.kind === "bare" || (decline?.kind === "signal" && decline.value === null);
  if (step.choices.length < 2 || declines.length !== 1 || !validDecline) {
    context.addIssue({ code: "custom", path: ["steps", index, "choices"],
      message: "An immediate offer requires at least two choices and exactly one bare or signal-clearing decline" });
  }
}
