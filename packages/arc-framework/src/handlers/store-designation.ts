/** Offer the store designation a pull asked for, and run the command that makes the chosen one. */
import { execa } from "execa";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareInteractionSite, type PromptSite } from "../lib/command-input/declaration.js";
import { prompt, type PromptRenderer } from "../lib/command-input/prompter.js";
import type { PullDesignation } from "../lib/store/pull-consumption.js";

/** The designation command's run, declared by every command that offers the designation. */
export const storeDesignationRunSite = declareInteractionSite(
  { file: "handlers/store-designation.ts", kind: "subprocess", callee: "execa", occurrence: 1 }, {
    acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "disable-terminal-input", flags: [], acceptedSyntax: [] },
    mutationBoundary: "store remote designation", subprocess: "terminal-prompts",
  });

/** A designation run's outcome; a failed run's own output already reached the terminal it inherited. */
export type StoreDesignationRun = { status: "ok" } | { status: "failed"; reason: string };

/** The question's renderer and the designation command's runner, native when omitted. */
export interface StoreDesignationPorts {
  readonly execute?: (argv: readonly string[], cwd: string, context: InteractionContext) => Promise<StoreDesignationRun>;
  readonly renderer?: PromptRenderer;
}

/** What came of the question: a designation made, none asked or chosen, a cancellation, or a failed command. */
export type StoreDesignationOutcome =
  | { readonly status: "designated"; readonly argv: readonly string[] }
  | { readonly status: "unanswered" | "cancelled" }
  | { readonly status: "failed"; readonly argv: readonly string[]; readonly reason: string };

/** Ask how the remote should serve store state where the invocation may prompt, then run the chosen designation.
 * @param site - The command's declared select prompt site.
 * @param designation - The question the pull raised, with the recommended command as its remedy.
 * @returns `unanswered` without asking where the invocation may not prompt.
 */
export async function offerStoreDesignation(site: PromptSite<"select">, designation: PullDesignation, cwd: string,
  context: InteractionContext, ports: StoreDesignationPorts = {}): Promise<StoreDesignationOutcome> {
  if (context.interaction !== "allowed") return { status: "unanswered" };
  const remedyArgv = designation.remedy.argv ?? [];
  const recommended = remedyArgv.at(-1);
  const answer = await prompt(site, context, {
    message: `How should remote ${designation.remote} serve store state?`,
    options: designation.choices.map(choice => ({ value: choice, label: choice,
      ...(choice === recommended ? { hint: remedyArgv.join(" ") } : {}) })),
    ...(recommended !== undefined && designation.choices.includes(recommended) ? { initialValue: recommended } : {}),
  }, ports.renderer);
  if (answer.kind === "cancelled") return { status: "cancelled" };
  if (answer.kind !== "answered" || !designation.choices.includes(answer.value)) return { status: "unanswered" };
  const argv = answer.value === recommended ? [...remedyArgv] : ["arc", "store", "remote", designation.remote, answer.value];
  const run = await (ports.execute ?? executeStoreDesignation)(argv, cwd, context);
  return run.status === "ok" ? { status: "designated", argv } : { status: "failed", argv, reason: run.reason };
}

async function executeStoreDesignation(argv: readonly string[], cwd: string, context: InteractionContext): Promise<StoreDesignationRun> {
  const [command, ...args] = argv;
  if (command === undefined) return { status: "ok" };
  const result = await execa(command, args, { cwd, reject: false, stdin: context.subprocess.ambientStdin === "closed" ? "ignore" : "inherit",
    stdout: "inherit", stderr: "inherit", env: context.subprocess.terminalPrompts === "forbidden" ? { GIT_TERMINAL_PROMPT: "0" } : {} });
  if (!result.failed) return { status: "ok" };
  return { status: "failed", reason: result.exitCode !== undefined ? `exited with code ${result.exitCode}`
    : result.signal ? `was ended by ${result.signal}` : `could not start: ${result.shortMessage}` };
}
