/** Open an archived file through the command's completed projection start. */
import { z } from "zod";
import { declareCliOperandSite, declareCliOptionSite } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import type { Store } from "../lib/store/contract.js";
import { projectionEditResult, type ProjectionEditResult } from "../lib/store/projection/edit.js";

/** Explicit archived path and optional machine output. */
export const EditInputSchema = z.strictObject({ path: z.string().min(1), json: z.boolean().optional() });
/** Canonical ownership of the edit command's inputs. */
export const editCommandInputRegistration: CommandInputRegistration = {
  commandPath: "edit", schema: EditInputSchema, schemaFields: { "operand.path": "path", "option.json": "json" },
};
/** Opening is explicit and never starts an editor or prompts. */
export const editCommandInputPolicyDeclarations = [{ commandPath: "edit", aliases: [], sites: [
  declareCliOperandSite("path", { acquisition: "parser-required", schemaOwnership: "owned", schemaField: "path",
    cancellation: "not-applicable", automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["<path>"] },
    mutationBoundary: "opened archive entry and local file mode", subprocess: "none" }),
  declareCliOptionSite("json", { acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
    cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none" }),
] }];

/** Print the opened path or its refusal with a repair route. */
export async function handleEdit(input: z.infer<typeof EditInputSchema>, store: Store, checkout: string): Promise<ProjectionEditResult> {
  const options = EditInputSchema.parse(input);
  const result = await projectionEditResult(store, checkout, options.path);
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : result.status === "ok"
    ? `Opened ${result.result.path} for editing; it stays writable until arc save lays it read-only again.\n`
    : `${result.refusal.code}: ${result.refusal.condition}\n${result.refusal.remedy.text}\n`);
  process.exitCode = result.status === "ok" ? 0 : 1;
  return result;
}
