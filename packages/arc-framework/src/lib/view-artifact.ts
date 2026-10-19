/**
 * Semantic artifact-group resolver for `arc view`.
 *
 * The viewer asks for kinds; this module selects the target and derives the
 * artifact group while every production effect arrives through injected ports.
 *
 * @module
 */

import { isAbsolute, join } from "node:path";

import { formatConflictToken } from "./status/conflict-token.js";
import type { SessionNotesPathResult } from "./handoff/session-notes-path.js";
import { resolveArcPath } from "./layout/index.js";
import { readViewTargetMeta, resolveRefViewArtifact, resolveViewDesignArtifact, viewWorkUnitArtifactPath } from "./view/started-artifacts.js";
import type { WorkUnitArtifactReaders } from "./status/work-unit-purpose.js";
import {
  VIEW_KINDS,
  type ResolvedViewTarget,
  type ResolveViewArtifactOptions,
  type ViewArtifactResult,
  type ViewKind,
  type ViewTargetResult,
  type StoreViewArtifactInput,
  type StoreViewArtifactRead,
} from "./view/types.js";

interface UserSurfacePaths {
  identityGlobalPath: (...segments: readonly string[]) => string;
  workingMemoryPath: string;
}

export interface ViewArtifactDependencies {
  stateOffBranch?: boolean;
  readStoreArtifact?: (input: StoreViewArtifactInput) => Promise<StoreViewArtifactRead>;
  resolveAmbientTarget: (options: {
    cwd: string;
    identity: string | null;
  }) => Promise<ViewTargetResult>;
  resolveExplicitTarget: (options: {
    cwd: string;
    slug: string;
  }) => Promise<ViewTargetResult>;
  resolveRecordedTarget?: (options: { cwd: string }) => Promise<ViewTargetResult>;
  resolveCohort: (options: { cwd: string; activeMetaPath: string; metaContent?: string }) => Promise<string | null>;
  resolveSessionNotes: (options: {
    cwd: string;
    identity: string;
    workUnitName: string;
  }) => Promise<SessionNotesPathResult>;
  resolveUserSurfaces: (options: {
    cwd: string;
    identity: string;
  }) => Promise<UserSurfacePaths>;
  pathExists: (path: string) => Promise<boolean>;
  readAtRef?: WorkUnitArtifactReaders["readAtRef"];
  readFile?: (path: string) => Promise<string>;
}

/** Resolve one view kind through the injected semantic authorities. */
export async function resolveViewArtifact(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  try {
    if (options.kind !== undefined && !isViewKind(options.kind)) {
      return error(options.kind, `Unknown view kind "${options.kind}". Valid kinds: ${VIEW_KINDS.join(", ")}.`);
    }
    if (dependencies.stateOffBranch === true && dependencies.readStoreArtifact !== undefined) {
      return await resolveStoreArtifactRequest(options, options.kind, dependencies, dependencies.readStoreArtifact);
    }
    return await resolveViewArtifactUnchecked(options, dependencies, options.kind);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return error(options.kind ?? "view", `Unable to resolve ${options.kind ?? "view"}: ${message}`);
  }
}

async function resolveViewArtifactUnchecked(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
  kind: ViewKind | undefined,
): Promise<ViewArtifactResult> {
  if (kind === "inbox" && options.project) {
    return presentOrAbsent(
      kind,
      join(
        options.cwd,
        resolveArcPath({ kind: "arc-root" }),
        "backlog",
        "ATOMIC-INBOX.md",
      ),
      null,
      dependencies,
    );
  }

  if (kind === "working-memory" || kind === "inbox") {
    if (options.identity === null) {
      return error(kind, "No ARC identity is configured for this identity-scoped artifact.");
    }
    const surfaces = await dependencies.resolveUserSurfaces({
      cwd: options.cwd,
      identity: options.identity,
    });
    const path = kind === "working-memory"
      ? surfaces.workingMemoryPath
      : surfaces.identityGlobalPath("USER-INBOX.md");
    return presentOrAbsent(kind, path, null, dependencies);
  }

  if (kind === "session-notes" && options.forSlug !== undefined && dependencies.stateOffBranch === true) {
    return resolveSessionContextArtifact(options, options.forSlug, dependencies);
  }

  const target = await resolveTarget(options, dependencies);
  if (target.status === "completed") {
    return error(kind ?? "view", `Work unit "${target.slug}" is completed; completed viewing is unsupported.`);
  }
  if (target.status === "unavailable") {
    return unavailableTarget(options, target);
  }

  if (kind === undefined) return resolveFurthestPresent(options.cwd, target, dependencies);
  return resolveExactKind(options, kind, target, dependencies);
}

async function resolveStoreArtifactRequest(options: ResolveViewArtifactOptions, requested: ViewKind | undefined,
  dependencies: ViewArtifactDependencies, read: NonNullable<ViewArtifactDependencies["readStoreArtifact"]>): Promise<ViewArtifactResult> {
  const global = requested === "working-memory" || requested === "inbox";
  if ((requested === "working-memory" || (requested === "inbox" && !options.project)) && options.identity === null) {
    return error(requested, "No ARC identity is configured for this identity-scoped artifact.");
  }
  let target: ResolvedViewTarget | undefined;
  if (!global) {
    const selected = await resolveTarget(options, dependencies);
    if (selected.status === "unavailable") return unavailableTarget(options, selected);
    if (selected.status === "completed") return error(requested ?? "view", `Work unit "${selected.slug}" is completed; completed viewing is unsupported.`);
    target = selected;
  }
  const kinds = storeViewKinds(requested, target);
  for (const kind of kinds) {
    const record = await read({ kind, target, project: options.project, identity: options.identity });
    if (record.status === "absent") continue;
    if (record.status === "error") return error(kind, record.message);
    return presentStoreArtifact(kind, record, target, options, dependencies);
  }
  return requested === undefined ? error("view", `Work unit "${target?.slug}" has no readable meta artifact.`) : { status: "absent", kind: requested };
}

function storeViewKinds(requested: ViewKind | undefined, target?: ResolvedViewTarget): readonly ViewKind[] {
  if (requested !== undefined) return [requested];
  return target?.location === "completed" ? ["meta"] : ["tasks", "spec", "draft", "meta"];
}
async function presentStoreArtifact(kind: ViewKind, record: Extract<StoreViewArtifactRead, { status: "found" }>,
  target: ResolvedViewTarget | undefined, options: ResolveViewArtifactOptions, dependencies: ViewArtifactDependencies): Promise<ViewArtifactResult> {
  const workUnit = target?.slug ?? null;
  const warnings = [...(record.warnings ?? []), ...record.conflicts.map(conflict =>
    `The ${kind} record has an open conflict. Inspect arc status --conflicts ${formatConflictToken(conflict)}.`)];
  if (await dependencies.pathExists(record.path)) return { status: "resolved", kind, path: record.path, workUnit, warnings };
  const subject = workUnit ?? (options.project ? "project" : options.identity ?? "project");
  const renderCommand = workUnit === null ? `arc view ${kind}${options.project ? " --project" : ""}` : `arc view ${kind} --for ${workUnit}`;
  return { status: "resolved", source: "store", kind, content: record.content, ref: record.version,
    displayLabel: `${subject}:${kind}`, workUnit, renderCommand, warnings };
}

async function resolveTarget(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ViewTargetResult> {
  if (options.forSlug !== undefined) {
    return dependencies.resolveExplicitTarget({ cwd: options.cwd, slug: options.forSlug });
  }
  const ambient = await dependencies.resolveAmbientTarget({
    cwd: options.cwd,
    identity: options.identity,
  });
  return ambient.status !== "unavailable" || dependencies.resolveRecordedTarget === undefined
    ? ambient
    : dependencies.resolveRecordedTarget({ cwd: options.cwd });
}

async function resolveFurthestPresent(
  cwd: string,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  for (const kind of ["tasks", "spec", "draft", "meta"] as const) {
    const result = await resolveExactKind({
      cwd,
      kind,
      project: false,
      identity: null,
    }, kind, target, dependencies);
    if (result.status === "resolved") return result;
  }
  return error("view", `Work unit "${target.slug}" has no readable meta artifact.`);
}

async function resolveExactKind(
  options: ResolveViewArtifactOptions,
  kind: ViewKind,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  if (isOwnArtifactKind(kind)) return resolveOwnArtifact(options.cwd, kind, target, dependencies);
  switch (kind) {
    case "cohort":
      return resolveCohortArtifact(options.cwd, target, dependencies);
    case "session-notes":
      return resolveSessionContextArtifact(options, target.slug, dependencies);
    case "working-memory":
    case "inbox":
      return error(kind, `The ${kind} artifact is identity-global and has no work-unit target.`);
  }
}

type OwnArtifactKind = Extract<ViewKind, "meta" | "tasks" | "spec" | "draft" | "notes" | "design">;

function isOwnArtifactKind(kind: ViewKind): kind is OwnArtifactKind {
  return ["meta", "tasks", "spec", "draft", "notes", "design"].includes(kind);
}

async function resolveOwnArtifact(
  cwd: string,
  kind: OwnArtifactKind,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  switch (kind) {
    case "meta":
      return presentOrAbsent(kind, viewWorkUnitArtifactPath(cwd, target, target.metaPath), target.slug, dependencies, target);
    case "tasks":
      return resolveTaskPath(cwd, target, dependencies);
    case "design":
      return resolveViewDesignArtifact({ cwd, target, readFile: dependencies.readFile, readAtRef: dependencies.readAtRef });
    case "spec":
    case "draft":
    case "notes":
      return presentOrAbsent(
        kind,
        viewWorkUnitArtifactPath(cwd, target, resolveArcPath({
          kind: "work-unit-artifact",
          placement: target.placement,
          slug: target.slug,
          artifact: kind,
        })),
        target.slug,
        dependencies,
        target,
      );
  }
}

async function resolveCohortArtifact(
  cwd: string,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  const metaContent = await readViewTargetMeta({
    cwd, target, readFile: dependencies.readFile, readAtRef: dependencies.readAtRef,
  });
  if (target.artifactSource !== undefined && metaContent === null) return { status: "absent", kind: "cohort" };
  const path = await dependencies.resolveCohort({
    cwd, activeMetaPath: target.metaPath,
    ...(metaContent === null ? {} : { metaContent }),
  });
  return path === null ? { status: "absent", kind: "cohort" }
    : presentOrAbsent("cohort", absolute(cwd, path), target.slug, dependencies);
}

async function resolveTaskPath(
  cwd: string,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  const conventional = viewWorkUnitArtifactPath(cwd, target, resolveArcPath({
    kind: "work-unit-artifact",
    placement: target.placement,
    slug: target.slug,
    artifact: "tasks",
  }));
  const paths = new Set([
    ...(target.taskListPath === null ? [] : [viewWorkUnitArtifactPath(cwd, target, target.taskListPath)]),
    conventional,
  ]);
  for (const path of paths) {
    const result = await presentOrAbsent("tasks", path, target.slug, dependencies, target);
    if (result.status !== "absent") return result;
  }
  return { status: "absent", kind: "tasks" };
}

function isViewKind(kind: string): kind is ViewKind {
  return (VIEW_KINDS as readonly string[]).includes(kind);
}

async function presentOrAbsent(
  kind: ViewKind,
  path: string,
  workUnit: string | null,
  dependencies: ViewArtifactDependencies,
  target?: ResolvedViewTarget,
): Promise<ViewArtifactResult> {
  const atRef = await resolveRefViewArtifact({ kind, path, target, readAtRef: dependencies.readAtRef });
  if (atRef !== null) return atRef;
  return await dependencies.pathExists(path)
    ? { status: "resolved", kind, path, workUnit }
    : { status: "absent", kind };
}

function unavailableTarget(
  options: ResolveViewArtifactOptions,
  target: Extract<ViewTargetResult, { status: "unavailable" }>,
): ViewArtifactResult {
  return error(options.kind ?? "view", target.message ?? (options.forSlug === undefined
    ? "No active work unit matches the current branch."
    : `Work unit "${options.forSlug}" is unavailable in this checkout.`));
}

function error(kind: string, message: string): ViewArtifactResult {
  return { status: "error", kind, message };
}

function absolute(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

async function resolveSessionContextArtifact(options: ResolveViewArtifactOptions, workUnit: string,
  dependencies: ViewArtifactDependencies): Promise<ViewArtifactResult> {
  if (options.identity === null) return error("session-notes", "No ARC identity is configured for this identity-scoped artifact.");
  const result = await dependencies.resolveSessionNotes({ cwd: options.cwd, identity: options.identity, workUnitName: workUnit });
  if (result.status === "error") return { status: "error", kind: "session-notes", message: result.message };
  return result.status === "absent" ? { status: "absent", kind: "session-notes" }
    : { status: "resolved", kind: "session-notes", path: result.path, workUnit };
}
