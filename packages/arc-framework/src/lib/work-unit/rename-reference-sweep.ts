/** Bounded lifecycle-tier reference rewrites for one work-unit slug rename. */

import { readFile, writeFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";

import {
  formatValue,
  parseMetaRecord,
  setMetaBulletFields,
} from "../active/meta-reader.js";
import { listArcFiles } from "../fs.js";

/** Filesystem seams used by {@link sweepRenameReferences}. */
export interface RenameReferenceSweepContext {
  listFiles(root: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

const nodeContext: RenameReferenceSweepContext = {
  listFiles: listArcFiles,
  readFile: (path) => readFile(path, "utf8"),
  writeFile: (path, content) => writeFile(path, content, "utf8"),
};

interface ArtifactSelfTitleRule {
  prefix: string;
  labels: readonly string[];
}

const ARTIFACT_SELF_TITLE_RULES: readonly ArtifactSelfTitleRule[] = [
  { prefix: "meta", labels: ["Metadata"] },
  { prefix: "draft", labels: ["Draft"] },
  {
    prefix: "spec",
    labels: [
      "Spec (`brief`)",
      "Spec (`outline`)",
      "Spec (`detailed` · `PRD`)",
      "Spec (`detailed` · `RFC`)",
    ],
  },
  { prefix: "tasks", labels: ["Task List", "Tasks"] },
  { prefix: "notes", labels: ["Notes"] },
  { prefix: "research", labels: ["Research"] },
  { prefix: "analysis", labels: ["Analysis"] },
] as const;

/** Parameters for the tier-wide reference sweep. */
export interface RenameReferenceSweepParams {
  arcRoot: string;
  sourceSlug: string;
  targetSlug: string;
  cohortDocRelativePath?: string;
  /** Exact current-checkout metas withheld from an in-flight coordination hazard. */
  excludedPaths?: readonly string[];
}

/** Paths changed by the bounded reference sweep, relative to the repository root. */
export interface RenameReferenceSweepResult {
  changedPaths: string[];
}

/** One precomputed reference rewrite, safe to apply after evidence capture. */
export interface RenameReferenceEdit {
  path: string;
  content: string;
}

/** A deterministic reference-sweep plan and its authority-bound path set. */
export interface RenameReferencePlan extends RenameReferenceSweepResult {
  edits: RenameReferenceEdit[];
}

/** Rewrite one member heading only inside a cohort doc's `## Members` section. */
export function rewriteCohortMemberHeading(content: string, sourceSlug: string, targetSlug: string): string {
  let inMembers = false;
  return content.split("\n").map((line) => {
    const h2 = /^##\s+(.*)$/u.exec(line);
    if (h2 !== null) {
      inMembers = (h2[1] ?? "").trim().toLowerCase() === "members";
      return line;
    }
    return inMembers && line === `### \`${sourceSlug}\`` ? `### \`${targetSlug}\`` : line;
  }).join("\n");
}

/**
 * Rewrite renamed artifact code spans and exact `Depends On` edges in lifecycle tiers.
 *
 * @param params - ARC root, slug map, and optional cohort document
 * @param ctx - Injectable filesystem traversal; defaults to the shipped ARC file walker
 * @returns Repository-relative paths whose content changed
 */
export async function sweepRenameReferences(
  params: RenameReferenceSweepParams,
  ctx: RenameReferenceSweepContext = nodeContext,
): Promise<RenameReferenceSweepResult> {
  const plan = await planRenameReferences(params, ctx);
  await applyRenameReferencePlan(plan, ctx);
  return { changedPaths: plan.changedPaths };
}

/**
 * Compute reference rewrites without mutating disk, so authority capture can
 * bind the exact additive path set before applying the sweep.
 *
 * @param params - ARC root, slug map, and optional cohort document
 * @param ctx - Injectable filesystem traversal
 * @returns Planned edits and repository-relative changed paths
 */
export async function planRenameReferences(
  params: RenameReferenceSweepParams,
  ctx: RenameReferenceSweepContext = nodeContext,
): Promise<RenameReferencePlan> {
  const excludedPaths = new Set(params.excludedPaths?.map((path) => path.replaceAll("\\", "/")) ?? []);
  const files = (await ctx.listFiles(params.arcRoot))
    .filter(isLifecycleTierFile)
    .sort();
  const changedPaths: string[] = [];
  const edits: RenameReferenceEdit[] = [];
  for (const relativePath of files) {
    const path = join(params.arcRoot, relativePath);
    if (excludedPaths.has(path.replaceAll("\\", "/"))) continue;
    const original = await ctx.readFile(path);
    let rewritten = rewriteArtifactSelfReferences(
      relativePath,
      original,
      params.sourceSlug,
      params.targetSlug,
    );
    rewritten = rewriteBacktickedArtifactReferences(rewritten, params.sourceSlug, params.targetSlug);
    if (basename(relativePath).startsWith("meta-") && basename(relativePath).endsWith(".md")) {
      rewritten = rewriteDependsOn(rewritten, params.sourceSlug, params.targetSlug);
    }
    if (relativePath === params.cohortDocRelativePath) {
      rewritten = rewriteCohortMemberHeading(rewritten, params.sourceSlug, params.targetSlug);
    }
    if (rewritten === original) continue;
    edits.push({ path, content: rewritten });
    changedPaths.push(posix.join(params.arcRoot.replaceAll("\\", "/"), relativePath));
  }
  return { changedPaths, edits };
}

/** Apply a previously computed reference plan in deterministic order. */
export async function applyRenameReferencePlan(
  plan: RenameReferencePlan,
  ctx: RenameReferenceSweepContext = nodeContext,
): Promise<void> {
  for (const edit of plan.edits) await ctx.writeFile(edit.path, edit.content);
}

function isLifecycleTierFile(path: string): boolean {
  return path.startsWith("active/")
    || path.startsWith("backlog/planned/")
    || path.startsWith("backlog/provisional/");
}

function rewriteArtifactSelfReferences(
  relativePath: string,
  content: string,
  sourceSlug: string,
  targetSlug: string,
): string {
  const rule = ARTIFACT_SELF_TITLE_RULES.find(
    (candidate) => basename(relativePath) === `${candidate.prefix}-${sourceSlug}.md`,
  );
  if (rule === undefined) return content;

  const lines = content.split("\n");
  const firstH1 = lines.findIndex((line) => line.startsWith("# "));
  if (firstH1 !== -1) {
    const line = lines[firstH1] ?? "";
    const carriageReturn = line.endsWith("\r") ? "\r" : "";
    const title = carriageReturn === "" ? line : line.slice(0, -1);
    const label = rule.labels.find((candidate) => title === `# ${candidate}: ${sourceSlug}`);
    if (label !== undefined) lines[firstH1] = `# ${label}: ${targetSlug}${carriageReturn}`;
  }

  return lines.join("\n").replaceAll(
    `\`--plan ${sourceSlug}\``,
    `\`--plan ${targetSlug}\``,
  );
}

function rewriteBacktickedArtifactReferences(content: string, sourceSlug: string, targetSlug: string): string {
  const escaped = sourceSlug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp("`([a-z]+)-" + escaped + "\\.md`", "gu");
  return content.replace(pattern, (match, prefix: string) =>
    prefix === "cohort" ? match : `\`${prefix}-${targetSlug}.md\``);
}

function rewriteDependsOn(content: string, sourceSlug: string, targetSlug: string): string {
  const record = parseMetaRecord(content);
  const dependencies = record.dependsOn;
  if (dependencies.length === 0 || !dependencies.includes(sourceSlug)) return content;
  const rewritten = dependencies.map((dependency) => dependency === sourceSlug ? targetSlug : dependency);
  return setMetaBulletFields(content, {
    "Depends On": formatValue(rewritten.join(", "), "identifier-list"),
  });
}
