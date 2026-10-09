/** Checkout-local editor documents generated from authored contracts. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { ensureGitExcludePattern } from "../git/exclude.js";
import type { GitExec } from "../git/exec.js";
import type { WorktreeMarkerIgnoreFs } from "../git/worktree-marker.js";
import { SlugSchema, type KernelRegistry } from "../kernel/index.js";
import { foldKernelSchemaClosure, projectKernelSchemas } from "../kernel/schema/generate.js";
import { resolveArcPath } from "../layout/index.js";
import { createProductionSchemaRegistry } from "../../production-schema-registry.js";

export interface EditorDocumentsFs extends WorktreeMarkerIgnoreFs {
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}
export const nodeEditorDocumentsFs: EditorDocumentsFs = {
  readFile: (path) => readFile(path, "utf8"), writeFile,
  mkdir: async (path, options) => { await mkdir(path, options); }, rm,
};
export interface EditorDocumentsFailure { target: "documents" | "exclude"; path?: string; detail: string }
export type EditorDocumentsResult = { ok: true; documents: string[] } | ({ ok: false } & EditorDocumentsFailure);
export type EditorDocumentsWriter = typeof writeEditorDocuments;

/** Provisioning failure carrying the exact failed write locus. */
export class EditorDocumentsWriteError extends Error {
  constructor(public readonly failure: EditorDocumentsFailure) {
    super(failure.detail);
    this.name = "EditorDocumentsWriteError";
  }
}

function detail(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/**
 * Replace the checkout's marked editor documents after registering their ignore entry.
 * @param root - Checkout being provisioned.
 * @param exec - Caller-owned Git executor.
 * @param fs - Injectable filesystem operations.
 * @param registry - Optional registry, defaulting to the production contracts.
 * @returns Written checkout-relative paths, or a typed write failure.
 * @throws Projection defects, which are independent of filesystem failure.
 */
export async function writeEditorDocuments(
  root: string, exec: GitExec, fs: EditorDocumentsFs, registry: KernelRegistry = createProductionSchemaRegistry(),
): Promise<EditorDocumentsResult> {
  const directory = resolveArcPath({ kind: "editor-document-root" });
  const exclusion = await ensureGitExcludePattern(root, `${directory}/`, exec, fs);
  if (!exclusion.ok) return { ok: false, target: "exclude", detail: detail(exclusion.error),
    ...(exclusion.path === undefined ? {} : { path: exclusion.path }) };

  const ids = registry.ids().filter((id) => registry.meta(id)?.authored === "editor-document");
  const bundle = ids.length === 0 ? undefined : projectKernelSchemas("input", registry);
  const documents = bundle === undefined ? [] : ids.map((id) => ({
    path: resolveArcPath({ kind: "editor-document", schema: SlugSchema.parse(id) }),
    content: `${JSON.stringify(foldKernelSchemaClosure(bundle, id), null, 2)}\n`,
  }));
  const absoluteDirectory = resolve(root, directory);
  try {
    await fs.rm(absoluteDirectory, { recursive: true, force: true });
    await fs.mkdir(absoluteDirectory, { recursive: true });
  } catch (error) { return { ok: false, target: "documents", path: absoluteDirectory, detail: detail(error) }; }
  for (const document of documents) {
    const path = resolve(root, document.path);
    try { await fs.writeFile(path, document.content); }
    catch (error) { return { ok: false, target: "documents", path, detail: detail(error) }; }
  }
  return { ok: true, documents: documents.map(({ path }) => path) };
}

/**
 * Apply the provisioning failure policy to editor-document writing.
 * @param root - Checkout being provisioned.
 * @param exec - Caller-owned Git executor.
 * @param fs - Injectable filesystem operations.
 * @param registry - Optional registry override.
 * @param writer - Optional writer seam shared by production and rollback tests.
 * @returns Written checkout-relative paths.
 * @throws EditorDocumentsWriteError when the writer returns a write failure.
 */
export async function writeEditorDocumentsOrThrow(
  root: string, exec: GitExec, fs: EditorDocumentsFs, registry?: KernelRegistry,
  writer: EditorDocumentsWriter = writeEditorDocuments,
): Promise<string[]> {
  const result = await writer(root, exec, fs, registry);
  if (!result.ok) throw new EditorDocumentsWriteError(result);
  return result.documents;
}

export type EditorDocumentReferenceResult =
  | { status: "found"; reference: string }
  | { status: "not-an-editor-document" }
  | { status: "unsupported-file" };

/**
 * Compose the schema reference relative to a project file with portable path separators.
 * @param id - Registered contract identity.
 * @param referencingPath - Checkout-relative path of the referencing YAML or JSON file.
 * @param registry - Optional registry override.
 * @returns Reference text, or the reason this identity or file has no editor reference.
 */
export function editorDocumentReference(
  id: string, referencingPath: string, registry: KernelRegistry = createProductionSchemaRegistry(),
): EditorDocumentReferenceResult {
  if (registry.meta(id)?.authored !== "editor-document") return { status: "not-an-editor-document" };
  const extension = posix.extname(referencingPath);
  if (extension !== ".yaml" && extension !== ".yml" && extension !== ".json") return { status: "unsupported-file" };
  const documentPath = resolveArcPath({ kind: "editor-document", schema: SlugSchema.parse(id) });
  const relative = posix.relative(posix.dirname(referencingPath), documentPath);
  const path = relative.startsWith("../") ? relative : `./${relative}`;
  return { status: "found", reference: extension === ".json" ? path : `# yaml-language-server: $schema=${path}` };
}
