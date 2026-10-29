/** Explicit inspection and designation of the ref store's clone-local remotes. */

import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declarePromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import { runStoreRemote } from "../lib/store/create.js";
import { StoreRemoteInputSchema, combineMigrateReports, type MigrateReport, type StoreRemoteResult } from "../lib/store/commands.js";
import { invalidStoreCommand, renderStoreCommand, storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";

/** Output and explicit publication options supplied by Commander. */
export interface StoreRemoteOptions { json?: boolean; ownState?: boolean }

/** Publishing this clone's complete store requires its explicit affirmative answer. */
export const storeOwnStatePromptSite = declarePromptSite("prompt.store.own-state", "confirm",
  { file: "commands/store-remote.ts", symbol: "storeOwnStatePromptSite" }, {
    acquisition: "protected-confirmation", schemaOwnership: "owned", schemaField: "ownState", cancellation: "stop",
    automation: { noInput: "require-authority", flags: ["--own-state"], acceptedSyntax: ["--own-state"] },
    mutationBoundary: "publishing this clone's complete store on another remote", subprocess: "none",
  });

/** Run the explicit ref-store remote entry through native production ports. */
export async function handleStoreRemote(remote: string | undefined, role: string | undefined,
  options: StoreRemoteOptions, interaction: InteractionContext,
  overrides: Partial<StoreCommandDependencies> = {}): Promise<StoreRemoteResult> {
  const io = await storeCommandDependencies(overrides);
  const parsed = StoreRemoteInputSchema.safeParse({ remote, role, ownState: options.ownState });
  if (!parsed.success) {
    const refused = invalidStoreCommand("remote", parsed.error.message);
    renderStoreCommand(refused, options.json === true, io); return refused;
  }
  const input = parsed.data;
  let result = await runStoreRemote(io.ports, input);
  if (result.status === "confirmation-needed") {
    const question = result;
    const answer = await prompt(storeOwnStatePromptSite, interaction, { message: result.condition, initialValue: false }, io.promptRenderer);
    // The accepted rerun reads any retained copy account again, so it carries only the move the question's run finished.
    if (answer.kind === "answered" && answer.value) result = withFinishedMove(await runStoreRemote(io.ports, { ...input, ownState: true }), question.finished);
    else if (answer.kind !== "refused") {
      io.write("Remote setting left unchanged.\n");
      result = withFinishedMove(await runStoreRemote(io.ports), question.report);
    }
  }
  renderStoreCommand(result, options.json === true, io);
  return result;
}

/** A move the question's run finished has no record left, so its report rides whatever the answer returns. */
function withFinishedMove(result: StoreRemoteResult, finished: MigrateReport | undefined): StoreRemoteResult {
  if (!finished) return result;
  const carried = (report: MigrateReport | undefined) => report ? combineMigrateReports(finished, report) : finished;
  if (result.status === "ok") return { ...result, result: { ...result.result, report: carried(result.result.report) } };
  if (result.status === "confirmation-needed") return { ...result, report: carried(result.report) };
  return result.refusal.code === "import-refused" ? result : { ...result, refusal: { ...result.refusal, report: carried(result.refusal.report) } };
}
