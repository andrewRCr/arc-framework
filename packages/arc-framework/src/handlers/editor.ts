/** Explicit checkout editor opt-in using the command's selected state capability. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { declareCliOperandSite, declareCliOptionSite } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { mergeEditorSettings } from "../lib/editor-settings.js";
import type { Store } from "../lib/store/contract.js";

/** Supported editor and explicit uninstall option from Commander. */
export const EditorInputSchema = z.strictObject({ editor: z.enum(["vscode", "zed"]), remove: z.boolean().optional() });
/** Canonical ownership of the editor command's arguments. */
export const editorCommandInputRegistration: CommandInputRegistration = {
  commandPath: "editor", schema: EditorInputSchema,
  schemaFields: { "operand.editor": "editor", "option.remove": "remove" },
};
/** Editor changes require explicit invocation and never prompt or launch another process. */
export const editorCommandInputPolicyDeclarations = [{ commandPath: "editor", aliases: [], sites: [
  declareCliOperandSite("editor", { acquisition: "parser-required", schemaOwnership: "owned", schemaField: "editor",
    cancellation: "not-applicable", automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["<editor>"] },
    mutationBoundary: "checkout editor settings", subprocess: "none" }),
  declareCliOptionSite("remove", { acquisition: "optional", schemaOwnership: "owned", schemaField: "remove",
    cancellation: "not-applicable", automation: { noInput: "preserve-absent", flags: ["--remove"], acceptedSyntax: [] },
    mutationBoundary: "remove ARC editor settings", subprocess: "none" }),
] }];

/** Merge or remove only ARC's settings, refusing before filesystem access when projection is unsupported. */
export async function handleEditor(input: z.infer<typeof EditorInputSchema>, store: Store, checkout: string): Promise<void> {
  const { editor, remove } = EditorInputSchema.parse(input);
  if (!store.capabilities.stateOffBranch) {
    process.stdout.write("unsupported: Editor settings require off-branch state.\nRetry after this repository switches to off-branch state.\n");
    process.exitCode = 1; return;
  }
  const path = `${editor === "vscode" ? ".vscode" : ".zed"}/settings.json`, absolute = join(checkout, path);
  const source = await readSettings(absolute), edit = mergeEditorSettings(source, editor, remove);
  if (edit.status === "refused") {
    process.stdout.write(`${path}: ${edit.condition}\nRepair the settings file, then retry arc editor ${editor}${remove ? " --remove" : ""}.\n`);
    process.exitCode = 1; return;
  }
  if (edit.content !== null && edit.content !== source) {
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, edit.content);
    process.stdout.write(`Updated ${path}.\n`);
  } else process.stdout.write(`No changes to ${path}.\n`);
}

async function readSettings(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
