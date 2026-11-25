/** Ask before adopting an unmanaged linked checkout as a new work unit. */
import { parseSpecInput } from "../../lib/active/spec-input-parser.js";
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import { appendAgendaOption, buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileOrient } from "./orient.js";
import { carryAgendaAnswers } from "./progress.js";
import type { AgendaStep, SessionInitAgenda } from "./schema.js";

const SCAFFOLD_ID = "cold-start:scaffold";

/** Offer scaffolding before the declined path's ordinary session entry. */
export async function compileColdStart(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  if (input.answers.answered[SCAFFOLD_ID] !== undefined) return compileOrient(input);
  const orient = await compileOrient(input);
  const scaffold: AgendaStep = { type: "offer", id: SCAFFOLD_ID, ask: "now",
    text: `This checkout has no ARC work unit. ${seedDisposition(input.signals.seed)}Scaffold one here?`, choices: [
      { kind: "actions", label: "Scaffold here", accepts: [SCAFFOLD_ID], actions: [scaffoldAction(input.signals.seed)], then: { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { dropSeed: true }) } },
      { kind: "bare", label: "Orient without scaffolding", decline: true },
    ] };
  return createSessionInitAgenda(input, { shape: "work-state" }, carryAgendaAnswers(input, [
    { type: "fragment", target: { kind: "workflow", path: ".arc/system/workflows/arc/work-unit-lifecycle/in-flight-scope-check.md" }, args: {} },
    scaffold, ...orient.steps,
  ]));
}


function scaffoldAction(seed: string | undefined): { text: string; argv: string[] } {
  const argv = ["arc", "start", "--here"];
  if (seed !== undefined) appendAgendaOption(argv, "--from", seed);
  return { text: `arc start --here${argv.length === 3 ? "" : ` ${argv.slice(3).map(quoteShellArgument).join(" ")}`}`, argv };
}

function seedDisposition(seed: string | undefined): string {
  if (seed === undefined) return "";
  const parsed = parseSpecInput(seed);
  if (!parsed.ok) return `Seed \`${seed}\`: ${parsed.reason}. `;
  return parsed.value.kind === "issue" ? `Seed \`${seed}\` sets the meta's \`Origin\` to \`${parsed.value.origin}\`. `
    : `Seed \`${seed}\` is passed through for planning. `;
}
