/** Report the outcome of the command's projection write-back. */
import { z } from "zod";
import { declareCliOptionSite } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { projectionSaveResult } from "../lib/store/projection/save.js";
import type { ProjectionSaveResult } from "../lib/store/projection/save.js";
import type { Store } from "../lib/store/contract.js";

/** Explicit conflict selection and output mode supplied by Commander. */
export const SaveInputSchema = z.strictObject({ resolve: z.string().optional(), json: z.boolean().optional() });
/** The save command's canonical input. */
export const saveCommandInputRegistration: CommandInputRegistration = {
  commandPath: "save", schema: SaveInputSchema,
  schemaFields: { "option.resolve": "resolve", "option.json": "json" },
};
/** Machine output requires no terminal interaction. */
export const saveCommandInputPolicyDeclarations = [{ commandPath: "save", aliases: [], sites: [declareCliOptionSite("json", {
  acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
  automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] }, mutationBoundary: "output selection", subprocess: "none",
})] }];

/** Render a complete save result after the root hook finishes its write-back. */
export async function handleSave(options: z.infer<typeof SaveInputSchema>,
  store: Store): Promise<ProjectionSaveResult> {
  SaveInputSchema.parse(options);
  const result = await projectionSaveResult(store);
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : result.status === "ok"
    ? `${result.result.version}\n` : `${result.refusal.code}: ${result.refusal.condition}\n${result.refusal.remedy.text}\n`);
  process.exitCode = result.status === "ok" ? 0 : 1;
  return result;
}
