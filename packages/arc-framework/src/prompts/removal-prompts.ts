/**
 * Removal resolution for `arc init --reconfigure`.
 *
 * Two-stage UX: bulk summary with classification labels, then optional
 * per-file prompts with classification-driven defaults.
 *
 * Non-interactive mode (--yes): Framework → remove, Scaffolded/Configurable → keep.
 *
 * @module
 */

import * as p from "@clack/prompts";
import type { PlannedRemoval } from "../lib/manifest/plan.js";
import type { Classification } from "../lib/types.js";

// --- Types ---

/** User's decision on a single file removal. */
export interface RemovalDecision {
  outputPath: string;
  classification: Classification;
  action: "remove" | "keep";
}

/** Callback signature for removal resolution — injected into reconfigure. */
export type RemovalResolveFn = (
  removals: PlannedRemoval[],
) => Promise<RemovalDecision[]>;

/** Result of splitting removal decisions for the apply pipeline. */
export interface AppliedRemovalDecisions {
  /** Files to delete from disk (passed to applyChangePlan as Framework removals). */
  toRemove: PlannedRemoval[];
  /** Files to keep on disk (excluded from applyChangePlan removals). */
  toKeep: PlannedRemoval[];
}

// --- Classification labels ---

function classificationLabel(c: Classification): string {
  switch (c) {
    case "Framework": return "framework-managed";
    case "Configurable": return "your customizations";
    case "Scaffolded": return "your content";
  }
}

// --- Non-interactive resolution ---

/**
 * Resolve removals using classification-driven defaults (--yes mode).
 *
 * Framework → remove, Scaffolded/Configurable → keep.
 */
export function resolveRemovalsNonInteractive(
  removals: PlannedRemoval[],
): RemovalDecision[] {
  return removals.map((r) => ({
    outputPath: r.outputPath,
    classification: r.classification,
    action: r.classification === "Framework" ? "remove" : "keep",
  }));
}

// --- Interactive resolution ---

/**
 * Two-stage interactive removal resolution.
 *
 * Stage 1: Summary of affected files with classification labels,
 * bulk options (remove all / keep all / choose individually).
 *
 * Stage 2 (if choose individually): Per-file prompts with
 * classification-driven defaults (Framework → default remove,
 * Scaffolded/Configurable → default keep).
 *
 * @returns Resolved decisions, or null if user cancelled
 */
export async function resolveRemovalsInteractive(
  removals: PlannedRemoval[],
): Promise<RemovalDecision[] | null> {
  if (removals.length === 0) return [];

  // Stage 1: Summary and bulk choice
  const frameworkFiles = removals.filter((r) => r.classification === "Framework");
  const userFiles = removals.filter((r) => r.classification !== "Framework");

  const lines: string[] = [];
  if (frameworkFiles.length > 0) {
    lines.push("Framework-managed:");
    for (const f of frameworkFiles) lines.push(`  .arc/${f.outputPath}`);
  }
  if (userFiles.length > 0) {
    lines.push("Your content/customizations:");
    for (const f of userFiles) lines.push(`  .arc/${f.outputPath}`);
  }
  p.log.message(`Files no longer needed with your new settings:\n${lines.join("\n")}`);

  const bulkChoice = await p.select({
    message: "What would you like to do with these files?",
    options: [
      {
        value: "defaults" as const,
        label: "Use defaults (remove framework-managed, keep your content)",
      },
      { value: "remove-all" as const, label: "Remove all" },
      { value: "keep-all" as const, label: "Keep all (remove from ARC tracking only)" },
      { value: "individual" as const, label: "Choose individually" },
    ],
  });

  if (p.isCancel(bulkChoice)) return null;

  // Bulk actions
  if (bulkChoice === "remove-all") {
    return removals.map((r) => ({ ...r, action: "remove" as const }));
  }
  if (bulkChoice === "keep-all") {
    return removals.map((r) => ({ ...r, action: "keep" as const }));
  }
  if (bulkChoice === "defaults") {
    return resolveRemovalsNonInteractive(removals);
  }

  // Stage 2: Per-file prompts
  const decisions: RemovalDecision[] = [];
  for (const r of removals) {
    const defaultRemove = r.classification === "Framework";
    const action = await p.select({
      message: `.arc/${r.outputPath} (${classificationLabel(r.classification)})`,
      options: [
        { value: "remove" as const, label: "Remove from disk" },
        { value: "keep" as const, label: "Keep on disk (remove from ARC tracking)" },
      ],
      initialValue: defaultRemove ? ("remove" as const) : ("keep" as const),
    });

    if (p.isCancel(action)) return null;
    decisions.push({ outputPath: r.outputPath, classification: r.classification, action });
  }

  return decisions;
}

// --- Decision application ---

/**
 * Transform removal decisions into two lists for the apply pipeline.
 *
 * Files to remove get Framework classification so `applyChangePlan`
 * calls `safeUnlink`. Files to keep are excluded from the removal list
 * entirely — they simply won't appear in the new manifest.
 */
export function applyRemovalDecisions(
  _originalRemovals: PlannedRemoval[],
  decisions: RemovalDecision[],
): AppliedRemovalDecisions {
  const toRemove: PlannedRemoval[] = [];
  const toKeep: PlannedRemoval[] = [];

  for (const d of decisions) {
    if (d.action === "remove") {
      // Force Framework classification so applyChangePlan calls safeUnlink
      toRemove.push({ outputPath: d.outputPath, classification: "Framework" });
    } else {
      toKeep.push({ outputPath: d.outputPath, classification: d.classification });
    }
  }

  return { toRemove, toKeep };
}
