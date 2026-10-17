/** Exact inspection and explicitly requested discard of a ref-store conflict. */
import { runStoreConflict } from "../lib/store/create.js";
import { StoreConflictInputSchema, type StoreConflictResult } from "../lib/store/commands.js";
import { renderStoreCommand, storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";

/** Output selection and explicit alternative-removal authority supplied by Commander. */
export interface StoreConflictOptions { discard?: boolean; json?: boolean }

/** Run one exact conflict operand through native ports and preserve the store result. */
export async function handleStoreConflict(uid: string, kind: string, id: string, options: StoreConflictOptions,
  overrides: Partial<StoreCommandDependencies> = {}): Promise<StoreConflictResult> {
  const io = await storeCommandDependencies(overrides);
  const parsed = StoreConflictInputSchema.safeParse({ uid, kind, id, discard: options.discard });
  const result: StoreConflictResult = parsed.success ? await runStoreConflict(io.ports, parsed.data) : {
    status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind", condition: parsed.error.message,
      remedy: { text: "Use arc store conflict --help with an owner UID, registered work-item conflict kind, and exact ID.", argv: ["arc", "store", "conflict", "--help"] } },
  };
  renderStoreCommand(result, options.json === true, io);
  return result;
}
