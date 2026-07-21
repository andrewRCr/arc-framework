/**
 * Semantic artifact-group resolver for `arc view`.
 *
 * The viewer asks for kinds; this module selects the target and derives the
 * artifact group while every production effect arrives through injected ports.
 *
 * @module
 */

import { isAbsolute, join } from "node:path";

import type { SessionNotesPathResult } from "./handoff/session-notes-path.js";
import { resolveArcPath } from "./layout/index.js";
import {
  VIEW_KINDS,
  type ResolvedViewTarget,
  type ResolveViewArtifactOptions,
  type ViewArtifactResult,
  type ViewKind,
  type ViewTargetResult,
} from "./view/types.js";

interface UserSurfacePaths {
  identityGlobalPath: (...segments: readonly string[]) => string;
  workingMemoryPath: string;
}

export interface ViewArtifactDependencies {
  resolveAmbientTarget: (options: {
    cwd: string;
    identity: string | null;
  }) => Promise<ViewTargetResult>;
  resolveExplicitTarget: (options: {
    cwd: string;
    slug: string;
  }) => Promise<ViewTargetResult>;
  resolveRecordedTarget?: (options: { cwd: string }) => Promise<ViewTargetResult>;
  resolveCohort: (options: { cwd: string; activeMetaPath: string }) => Promise<string | null>;
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
}

/** Resolve one view kind through the injected semantic authorities. */
export async function resolveViewArtifact(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  try {
    return await resolveViewArtifactUnchecked(options, dependencies);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return error(options.kind ?? "view", `Unable to resolve ${options.kind ?? "view"}: ${message}`);
  }
}

async function resolveViewArtifactUnchecked(
  options: ResolveViewArtifactOptions,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  if (options.kind !== undefined && !isViewKind(options.kind)) {
    return error(options.kind, `Unknown view kind "${options.kind}". Valid kinds: ${VIEW_KINDS.join(", ")}.`);
  }
  const kind = options.kind;

  if (kind === "inbox" && options.project) {
    return presentOrAbsent(
      kind,
      join(options.cwd, ".arc", "backlog", "ATOMIC-INBOX.md"),
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

  const target = await resolveTarget(options, dependencies);
  if (target.status === "completed") {
    return error(kind ?? "view", `Work unit "${target.slug}" is completed; completed viewing is unsupported.`);
  }
  if (target.status === "unavailable") {
    return options.forSlug === undefined
      ? error(kind ?? "view", "No active work unit matches the current branch.")
      : error(kind ?? "view", `Work unit "${options.forSlug}" is unavailable in this checkout.`);
  }

  if (kind === undefined) return resolveFurthestPresent(options.cwd, target, dependencies);
  return resolveExactKind(options, kind, target, dependencies);
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
  switch (kind) {
    case "meta":
      return presentOrAbsent(kind, absolute(options.cwd, target.metaPath), target.slug, dependencies);
    case "tasks": {
      const path = await resolveTaskPath(options.cwd, target, dependencies);
      return path === null
        ? { status: "absent", kind }
        : { status: "resolved", kind, path, workUnit: target.slug };
    }
    case "spec":
    case "draft":
    case "notes":
      return presentOrAbsent(
        kind,
        join(options.cwd, resolveArcPath({
          kind: "work-unit-artifact",
          placement: target.placement,
          slug: target.slug,
          artifact: kind,
        })),
        target.slug,
        dependencies,
      );
    case "cohort": {
      const path = await dependencies.resolveCohort({
        cwd: options.cwd,
        activeMetaPath: target.metaPath,
      });
      return path === null
        ? { status: "absent", kind }
        : presentOrAbsent(kind, absolute(options.cwd, path), target.slug, dependencies);
    }
    case "session-notes": {
      if (options.identity === null) {
        return error(kind, "No ARC identity is configured for this identity-scoped artifact.");
      }
      const result = await dependencies.resolveSessionNotes({
        cwd: options.cwd,
        identity: options.identity,
        workUnitName: target.slug,
      });
      if (result.status === "error") return { status: "error", kind, message: result.message };
      if (result.status === "absent") return { status: "absent", kind };
      return presentOrAbsent(kind, result.path, target.slug, dependencies);
    }
    case "working-memory":
    case "inbox":
      return error(kind, `The ${kind} artifact is identity-global and has no work-unit target.`);
  }
}

async function resolveTaskPath(
  cwd: string,
  target: ResolvedViewTarget,
  dependencies: ViewArtifactDependencies,
): Promise<string | null> {
  if (target.taskListPath !== null) {
    const pointer = absolute(cwd, target.taskListPath);
    if (await dependencies.pathExists(pointer)) return pointer;
  }
  const conventional = join(cwd, resolveArcPath({
    kind: "work-unit-artifact",
    placement: target.placement,
    slug: target.slug,
    artifact: "tasks",
  }));
  return await dependencies.pathExists(conventional) ? conventional : null;
}

function isViewKind(kind: string): kind is ViewKind {
  return (VIEW_KINDS as readonly string[]).includes(kind);
}

async function presentOrAbsent(
  kind: ViewKind,
  path: string,
  workUnit: string | null,
  dependencies: ViewArtifactDependencies,
): Promise<ViewArtifactResult> {
  return await dependencies.pathExists(path)
    ? { status: "resolved", kind, path, workUnit }
    : { status: "absent", kind };
}

function error(kind: string, message: string): ViewArtifactResult {
  return { status: "error", kind, message };
}

function absolute(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}
