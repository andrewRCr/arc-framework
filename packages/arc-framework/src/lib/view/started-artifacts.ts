/** Select the current metadata and artifact source for a started work unit. */

import { dirname, isAbsolute, join, posix } from "node:path";
import { parseMetaRecord } from "../active/meta-reader.js";
import { SlugSchema } from "../kernel/index.js";
import type { ProjectReadinessRecord } from "../status/project-view.js";
import { createWorkUnitArtifactReader, readRegularWorkUnitArtifact, selectWorkUnitDesign, type WorkUnitArtifactReaders } from "../status/work-unit-purpose.js";
import type { ResolvedViewArtifact, ResolvedViewTarget, ViewArtifactResult, ViewKind, ViewTargetResult } from "./types.js";

/**
 * Read prepared reference content or the selected real file.
 * @param artifact - Resolved artifact.
 * @param readFile - Caller-bound filesystem reader.
 * @returns Selected UTF-8 content.
 */
export async function readViewArtifactContent(
  artifact: ResolvedViewArtifact, readFile: (path: string) => Promise<string>,
): Promise<string> {
  return "ref" in artifact ? artifact.content : await readFile(artifact.path);
}

/**
 * Name the selected copy for presentation.
 * @param artifact - Resolved file or reference artifact.
 * @returns File path or ref-qualified display label.
 */
export function viewArtifactDisplayLabel(artifact: ResolvedViewArtifact): string {
  return "ref" in artifact ? artifact.displayLabel : artifact.path;
}

/**
 * Explain why a reference artifact cannot be given to a file consumer.
 * @param artifact - Resolved artifact.
 * @returns A rendering remedy for reference content, or null for real files.
 */
export function viewArtifactFileRefusal(artifact: ResolvedViewArtifact): string | null {
  return "ref" in artifact
    ? `Work unit "${artifact.workUnit}" is at "${artifact.ref}" without a registered checkout. `
      + `Read it by rendering: arc view ${artifact.kind} --for ${artifact.workUnit}.`
    : null;
}

/**
 * Read a target's own metadata for companion-document selection.
 * @param input - Selected target and caller-bound checkout/ref readers.
 * @returns Metadata from the selected source, or null when unavailable.
 */
export async function readViewTargetMeta(input: ViewTargetArtifactInput): Promise<string | null> {
  return await readTargetArtifact(input, input.target.metaPath);
}

/** Readers bound to one selected viewer target. */
export interface ViewTargetArtifactInput {
  cwd: string;
  target: ResolvedViewTarget;
  readFile?: (path: string) => Promise<string>;
  readAtRef?: WorkUnitArtifactReaders["readAtRef"];
}

/**
 * Resolve the selected target's Design list through the shared purpose selector.
 * @param input - Target and caller-bound source readers.
 * @returns The selected file or ref content, or normal absence.
 */
export async function resolveViewDesignArtifact(input: ViewTargetArtifactInput): Promise<ViewArtifactResult> {
  const meta = await readViewTargetMeta(input);
  if (meta === null) return { status: "absent", kind: "design" };
  const source = input.target.artifactSource;
  const paths = source?.kind === "ref" ? posix : { dirname, join };
  const pathFor = (name: string): string => paths.join(paths.dirname(input.target.metaPath), name);
  const selected = await selectWorkUnitDesign(meta, (name) => readTargetArtifact(input, pathFor(name)));
  if (selected === null) return { status: "absent", kind: "design" };
  const path = viewWorkUnitArtifactPath(input.cwd, input.target, pathFor(selected.name));
  return source?.kind === "ref" ? {
    status: "resolved", kind: "design", content: selected.content, ref: source.ref,
    displayLabel: `${source.ref}:${path}`, workUnit: input.target.slug,
  } : { status: "resolved", kind: "design", path, workUnit: input.target.slug };
}

async function readTargetArtifact(input: ViewTargetArtifactInput, path: string): Promise<string | null> {
  const source = input.target.artifactSource;
  if (source?.kind === "ref") {
    return input.readAtRef === undefined ? null
      : await readRegularWorkUnitArtifact(source.ref, path, input.readAtRef);
  }
  try {
    return await input.readFile?.(viewWorkUnitArtifactPath(input.cwd, input.target, path)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Preserve repository-relative paths at refs and materialize selected checkout paths.
 * @param cwd - Invoking checkout root.
 * @param target - Selected target.
 * @param path - Artifact path relative to its checkout or ref.
 * @returns A ref-relative path or absolute file path.
 */
export function viewWorkUnitArtifactPath(cwd: string, target: ResolvedViewTarget, path: string): string {
  return target.artifactSource?.kind === "ref" || isAbsolute(path)
    ? path : join(viewWorkUnitCheckoutRoot(cwd, target), path);
}

/**
 * Resolve reference content without consulting another checkout's file copy.
 * @param input - Artifact identity, selected target, and caller-bound local ref reader.
 * @returns A ref-backed result, or null when ordinary file resolution applies.
 */
export async function resolveRefViewArtifact(input: {
  kind: ViewKind;
  path: string;
  target?: ResolvedViewTarget;
  readAtRef?: WorkUnitArtifactReaders["readAtRef"];
}): Promise<ViewArtifactResult | null> {
  const source = input.target?.artifactSource;
  if (source?.kind !== "ref") return null;
  if (input.readAtRef === undefined) {
    return { status: "error", kind: input.kind, message: `Reference content for "${input.target?.slug}" is unavailable.` };
  }
  const content = await readRegularWorkUnitArtifact(source.ref, input.path, input.readAtRef);
  return content === null ? { status: "absent", kind: input.kind } : {
    status: "resolved", kind: input.kind, content, ref: source.ref,
    displayLabel: `${source.ref}:${input.path}`, workUnit: input.target?.slug ?? null,
  };
}

/**
 * Select the checkout root used for a work unit's own file artifacts.
 * @param cwd - Invoking checkout for ordinary local targets.
 * @param target - Selected viewer target and its optional registered checkout.
 * @returns The selected work-unit checkout root.
 */
export function viewWorkUnitCheckoutRoot(cwd: string, target: ResolvedViewTarget): string {
  return target.artifactSource?.kind === "checkout" ? target.artifactSource.cwd : cwd;
}

/** Inputs bound by the viewer to one selected record and its metadata readers. */
export interface StartedViewTargetInput {
  record: ProjectReadinessRecord;
  worktreePath?: string;
  readers: WorkUnitArtifactReaders;
  taskListPath: (metaPath: string, pointer: string | null) => string | null;
}

/**
 * Prefer a registered checkout's working copy, otherwise keep the selected local ref.
 * @param input - Selected record, registered checkout, and caller-owned readers.
 * @returns The started target, or unavailable when its own metadata cannot be read.
 */
export async function resolveStartedViewTarget(input: StartedViewTargetInput): Promise<ViewTargetResult> {
  const unavailable = { status: "unavailable" as const, slug: input.record.slug };
  const slug = SlugSchema.safeParse(input.record.slug);
  const selected = createWorkUnitArtifactReader(input.record.source, input.readers);
  if (!slug.success || selected === null || selected.location.kind !== "ref") return unavailable;
  const { metaPath, ref } = selected.location;
  const reader = input.worktreePath === undefined ? selected : createWorkUnitArtifactReader({
    kind: "active-meta", location: "active", path: join(input.worktreePath, metaPath),
  }, input.readers);
  const content = await reader?.readMeta();
  if (content === null || content === undefined) return unavailable;
  try {
    const meta = parseMetaRecord(content);
    return {
      status: "resolved", slug: slug.data, location: "active",
      placement: { kind: "active", scope: { kind: "project" } },
      metaPath, taskListPath: input.taskListPath(metaPath, meta.taskList),
      artifactSource: input.worktreePath === undefined ? { kind: "ref", ref }
        : { kind: "checkout", cwd: input.worktreePath },
    };
  } catch {
    return unavailable;
  }
}
