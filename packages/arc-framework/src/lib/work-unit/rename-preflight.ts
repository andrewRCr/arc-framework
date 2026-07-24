/**
 * Pure and read-only preflight decisions for work-unit rename.
 *
 * These checks run before any artifact, git, notes, or marker mutation. They
 * share lifecycle and path identity primitives with the existing command set
 * so a refusal leaves the repository unchanged.
 *
 * @module
 */

import type { WorktreeSubject } from "../git/worktree-marker.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import { localPathContains } from "../local-path-identity.js";
import {
  isComposedLifecycleSlugIndeterminate,
  type ComposedLifecycleIndexResult,
} from "./composed-lifecycle-index.js";
import type { LifecycleIndex, LifecycleIndexEntry } from "./lifecycle-index.js";

/** Validated old/new work-unit slugs. */
export interface ValidatedRenameRequest {
  oldSlug: Slug;
  newSlug: Slug;
}

/**
 * Validate path-bearing rename inputs before lifecycle resolution.
 *
 * @param oldSlug - Existing work-unit identity
 * @param newSlug - Requested replacement identity
 * @returns Narrowed slugs
 */
export function validateRenameRequest(oldSlug: string, newSlug: string): ValidatedRenameRequest {
  const oldResult = SlugSchema.safeParse(oldSlug);
  if (!oldResult.success) throw new Error(`invalid source slug for rename: ${oldSlug}`);
  const newResult = SlugSchema.safeParse(newSlug);
  if (!newResult.success) throw new Error(`invalid target slug for rename: ${newSlug}`);
  if (oldResult.data === newResult.data) {
    throw new Error("rename requires a target slug different from the current slug");
  }
  return { oldSlug: oldResult.data, newSlug: newResult.data };
}

/** A work unit resolved under its pre- or post-commit identity. */
export interface ResolvedRenameSubject {
  entry: LifecycleIndexEntry;
  resolvedSlug: string;
  resuming: boolean;
}

/**
 * Resolve exactly one side of an old/new slug pair.
 *
 * @param index - Lifecycle-complete work-unit index
 * @param oldSlug - Pre-rename identity
 * @param newSlug - Post-rename identity
 * @returns The unique subject and whether the run is resuming
 */
export function resolveRenameSubject(
  index: LifecycleIndex,
  oldSlug: string,
  newSlug: string,
): ResolvedRenameSubject {
  const oldEntry = index.get(oldSlug);
  const newEntry = index.get(newSlug);
  if (oldEntry !== undefined && newEntry !== undefined) {
    throw new Error(`cannot rename because both work-unit slugs resolve: ${oldSlug}, ${newSlug}`);
  }
  if (oldEntry !== undefined) return { entry: oldEntry, resolvedSlug: oldSlug, resuming: false };
  if (newEntry !== undefined) return { entry: newEntry, resolvedSlug: newSlug, resuming: true };
  throw new Error(`cannot rename because neither work-unit slug resolves: ${oldSlug}, ${newSlug}`);
}

/**
 * Require execution from the worktree that holds the subject branch.
 *
 * @param paths - Current process locus and live holding worktree root
 */
export async function assertRenameExecutionLocus(paths: {
  currentLocus: string;
  holdingWorktreePath: string;
}): Promise<void> {
  if (await localPathContains(paths.holdingWorktreePath, paths.currentLocus)) return;
  throw new Error(
    `rename must run from the checkout holding the work unit: ${paths.holdingWorktreePath}`,
  );
}

/**
 * Check subject type, lifecycle tier, tree cleanliness, and tracked PR state.
 *
 * @param input - Resolved subject facts captured before mutation
 */
export function assertRenameSubjectPreconditions(input: {
  subject: WorktreeSubject;
  entry: LifecycleIndexEntry;
  dirty: boolean;
  prUrl: string | undefined;
}): void {
  if (input.subject.kind !== "work-unit") {
    throw new Error("rename accepts work-unit subjects only");
  }
  if (input.entry.location === "completed") {
    throw new Error(`cannot rename an archived completed work unit: ${input.entry.slug}`);
  }
  if (input.dirty) throw new Error("cannot rename from a dirty checkout");
  const prUrl = input.prUrl?.trim();
  if (prUrl !== undefined && prUrl !== "" && prUrl !== "[none]") {
    throw new Error(`cannot rename a work unit with an open PR: ${prUrl}`);
  }
}

/**
 * Refuse an occupied or indeterminate target while accepting the subject's own
 * post-commit slug on resume.
 *
 * @param composed - Live-composed lifecycle truth
 * @param names - Currently resolved subject slug and requested target
 */
export function assertRenameCollisionFree(
  composed: ComposedLifecycleIndexResult,
  names: { resolvedSlug: string; targetSlug: string },
): void {
  if (isComposedLifecycleSlugIndeterminate(composed, names.targetSlug)) {
    throw new Error(`cannot prove target slug is free; live truth is indeterminate: ${names.targetSlug}`);
  }
  const target = composed.index.get(names.targetSlug);
  if (target !== undefined && target.slug !== names.resolvedSlug) {
    throw new Error(`target slug ${names.targetSlug} belongs to a different work unit`);
  }
}
