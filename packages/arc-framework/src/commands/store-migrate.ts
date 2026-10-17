/** Explicit migration entry for layout, remote and import operations on the ref store. */

import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { runStoreMigrate } from "../lib/store/create.js";
import { StoreMigrateInputSchema, type StoreMigrateInput, type StoreMigrateResult } from "../lib/store/commands.js";
import { invalidStoreCommand, renderStoreCommand, storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";

/** Migrate's engine inputs and command-owned output mode. */
export interface StoreMigrateOptions extends StoreMigrateInput { json?: boolean }

/** Run the explicit migration engine and preserve its report or actionable refusal. */
export async function handleStoreMigrate(options: StoreMigrateOptions, _interaction: InteractionContext,
  overrides: Partial<StoreCommandDependencies> = {}): Promise<StoreMigrateResult> {
  const io = await storeCommandDependencies(overrides);
  const input = StoreMigrateInputSchema.safeParse({ to: options.to, trial: options.trial, leaveSource: options.leaveSource, import: options.import });
  const result = input.success ? await runStoreMigrate(io.ports, input.data) : invalidStoreCommand("migrate", input.error.message);
  renderStoreCommand(result, options.json === true, io);
  return result;
}
