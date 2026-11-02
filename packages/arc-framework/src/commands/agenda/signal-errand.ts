/** Compile explicit Errand launch intent without allocating a checkout. */
import { SlugSchema } from "../../lib/kernel/index.js";
import { basename } from "node:path";
import { resolveArcPath } from "../../lib/layout/index.js";
import { resolveErrandNext } from "../errand-next.js";
import { extractReminderEntries, type ReminderEntry } from "../../lib/session-init/inbox-reminders.js";
import { buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileCheckoutSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { AgendaOrientation, AgendaStep, OfferChoice, SessionInitAgenda } from "./schema.js";

/** Compile the notes prefix and hand a selected concern to its owning workflow. */
export async function compileErrandSignal(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const seed = typeof input.signals.errand === "string" ? input.signals.errand : null;
  const orientation: AgendaOrientation = { shape: "subject", subject: { kind: "errand", key: seed } };
  const prefix = compileSyncPrefix(input, "notes");
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, prefix));
  if (input.signals.next) return compileQueueHead(input, prefix);
  const { entries, notes } = await readCaptures(input);
  const capture = entries.find(entry => entry.key === seed);
  const decision: AgendaStep = seed === null ? pickErrand(input, entries) : { type: "fragment", target: {
    kind: "workflow", path: ".arc/system/workflows/arc/run-errand.md",
  }, args: { mode: "launch", seed, isolate: input.signals.isolate === true,
    ...(capture === undefined ? {} : { fromInbox: capture.key }) } };
  return createSessionInitAgenda(input, orientation, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input),
    ...orderOrientationSurfaces(compileCheckoutSessionOrientation(input, "notes")), ...notes, decision,
  ]));
}

async function readCaptures(input: AgendaCompileInput): Promise<{ entries: ReminderEntry[]; notes: AgendaStep[] }> {
  try {
    const content = await input.entry.readUserInbox(input.entry.identity ?? "");
    return { entries: extractReminderEntries({ content }).entries, notes: [] };
  } catch (error) {
    const inbox = basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: SlugSchema.parse(input.entry.identity ?? "identity") } }), ".md");
    return { entries: [], notes: [{ type: "note", surface: "errand-inbox",
      text: `${inbox} could not be read: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}

function pickErrand(input: AgendaCompileInput, entries: ReminderEntry[]): AgendaStep {
  const argv = (value: string | null): string[] => buildAgendaArgv(input.signals, input.answers,
    { signal: { signal: "errand", value } });
  return { type: "offer", id: "errand:pick", ask: "now", text: "Select an Errand capture or describe a new concern.", choices: [
    ...entries.map((entry): OfferChoice => ({ kind: "signal", label: entry.key, signal: "errand", value: entry.key,
      recompile: argv(entry.key) })),
    { kind: "elicit", label: "Describe a new concern", signal: "errand",
      recompile: buildAgendaArgv(input.signals, input.answers, { elicit: "errand" }) },
    { kind: "signal", label: "Continue without an Errand", signal: "errand", value: null, decline: true, recompile: argv(null) },
  ] };
}

async function compileQueueHead(input: AgendaCompileInput, prefix: AgendaStep[]): Promise<SessionInitAgenda> {
  const result = await resolveErrandNext(input.entry);
  const key = result.nextOffer?.key ?? null;
  const tail: AgendaStep = result.state === "available" ? { type: "fragment", target: {
    kind: "workflow", path: ".arc/system/workflows/arc/run-errand.md",
  }, args: { mode: "launch", fromInbox: key, isolate: input.signals.isolate === true } }
    : { type: "gate", kind: "stop", autoProceed: false };
  return createSessionInitAgenda(input, { shape: "subject", subject: { kind: "errand", key } }, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input), { type: "render", surface: "errand-next", text: result.recommendedPromptText },
    ...(result.state === "available" ? orderOrientationSurfaces(compileCheckoutSessionOrientation(input, "notes", { next: true })) : []), tail,
  ]));
}
