/** Explicit migration entry for layout, remote and import operations on the ref store. */

import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declarePromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import { runStoreRemote, runStoreMigrate } from "../lib/store/create.js";
import { StoreMigrateInputSchema, type StoreMigrateInput, type StoreMigrateResult } from "../lib/store/commands.js";
import { invalidStoreCommand, renderStoreCommand, storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";

/** Migrate's engine inputs and command-owned output mode. */
export interface StoreMigrateOptions extends StoreMigrateInput { json?: boolean }

/** A follow asks because selecting push publishes this clone's state at the destination. */
export const storeFollowPromptSite = declarePromptSite("prompt.store.follow", "select",
  { file: "commands/store-migrate.ts", symbol: "storeFollowPromptSite" }, {
    acquisition: "handler-required", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["arc store remote <remote> <role>"] },
    mutationBoundary: "following moved project state with an explicit remote role", subprocess: "none",
  });

/** Run the explicit migration engine and preserve its report or actionable refusal. */
export async function handleStoreMigrate(options: StoreMigrateOptions, interaction: InteractionContext,
  overrides: Partial<StoreCommandDependencies> = {}): Promise<StoreMigrateResult> {
  const io = await storeCommandDependencies(overrides);
  const input = StoreMigrateInputSchema.safeParse({ to: options.to, trial: options.trial, leaveSource: options.leaveSource, import: options.import });
  let result = input.success ? await runStoreMigrate(io.ports, input.data) : invalidStoreCommand("migrate", input.error.message);
  if (result.status === "designation-needed") {
    const question = result, recommended = question.remedy.argv?.at(-1);
    const answer = await prompt(storeFollowPromptSite, interaction, {
      message: `Choose the state role for ${question.remote}. Push publishes this clone's state there.`,
      options: question.choices.map(value => ({ value, label: value })),
      initialValue: question.choices.find(value => value === recommended),
    }, io.promptRenderer);
    if (answer.kind === "answered") {
      const followed = await runStoreRemote(io.ports, { remote: question.remote, role: answer.value });
      result = followed.status === "ok" ? { status: "ok", result: followed.result.report ?? {
        move: "remote", refs: [], refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: [],
      } } : followed.status === "refused" ? followed : question;
    }
  }
  renderStoreCommand(result, options.json === true, io);
  return result;
}
