/** Report the editable Markdown selection after the command's projection start. */
import { z } from "zod";
import { declareCliOptionSite } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import type { Store } from "../lib/store/contract.js";
import { projectionSelectionResult, type ProjectionSelectionResult } from "../lib/store/projection/selection.js";

/** Selection scope and output mode supplied by Commander. */
export const SelectionInputSchema = z.strictObject({ changed: z.boolean().optional(), json: z.boolean().optional() });
/** Canonical input ownership for selection. */
export const selectionCommandInputRegistration: CommandInputRegistration = {
  commandPath: "selection", schema: SelectionInputSchema, schemaFields: { "option.changed": "changed", "option.json": "json" },
};
/** Both selection options are noninteractive and run no subprocess. */
export const selectionCommandInputPolicyDeclarations = [{ commandPath: "selection", aliases: [], sites: [
  declareCliOptionSite("changed", { acquisition: "optional", schemaOwnership: "owned", schemaField: "changed", cancellation: "not-applicable",
    automation: { noInput: "preserve-absent", flags: ["--changed"], acceptedSyntax: [] }, mutationBoundary: "selection scope", subprocess: "none" }),
  declareCliOptionSite("json", { acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] }, mutationBoundary: "output selection", subprocess: "none" }),
] }];

/** Print one path per line, or the same paths as JSON, preserving refusal evidence. */
export async function handleSelection(input: z.infer<typeof SelectionInputSchema>, store: Store, checkout: string): Promise<ProjectionSelectionResult> {
  const options = SelectionInputSchema.parse(input);
  const result = await projectionSelectionResult(store, checkout, options);
  if (result.status === "ok") process.stdout.write(options.json ? `${JSON.stringify(result.result)}\n` : result.result.paths.map(path => `${path}\n`).join(""));
  else process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${result.refusal.code}: ${result.refusal.condition}\n${result.refusal.remedy.text}\n`);
  process.exitCode = result.status === "ok" ? 0 : 1;
  return result;
}
