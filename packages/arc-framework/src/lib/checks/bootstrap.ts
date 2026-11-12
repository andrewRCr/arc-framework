/** Preserve retired installation sources as an inactive project check proposal. */
import { join } from "node:path";
import type { ApplyIO } from "../manifest/apply.js";
import type { PlannedRemoval } from "../manifest/plan.js";
import { editorDocumentReference } from "../schema-command/editor-documents.js";
import {
  checkProposalSourceFiles, extractCheckProposal, type CheckProposalSources,
  type ProposedCommand, type UnextractableSource,
} from "./bootstrap-extraction.js";

export interface CheckBootstrapReport {
  written: boolean;
  commands: ProposedCommand[];
  unextractable: UnextractableSource[];
}
async function readOptional(path: string, readFile: ApplyIO["readFile"]): Promise<string | undefined> {
  try { return await readFile(path); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
/**
 * Snapshot retiring sources and write a proposal only when the project has no declaration.
 * @param arcDir - Installation directory before applying its change plan
 * @param removals - Original planned removals, before interactive keep decisions
 * @param io - Caller-owned filesystem operations
 * @returns Source report when a check surface retires, otherwise no bootstrap
 */
export async function bootstrapRetiredChecks(
  arcDir: string, removals: readonly PlannedRemoval[], io: Pick<ApplyIO, "readFile" | "writeFile">,
): Promise<CheckBootstrapReport | null> {
  const retired = [checkProposalSourceFiles.method, checkProposalSourceFiles.postTask, checkProposalSourceFiles.postUnit];
  if (!removals.some(removal => retired.includes(removal.outputPath))) return null;
  const sources: CheckProposalSources = {};
  for (const [key, path] of Object.entries(checkProposalSourceFiles)) {
    const content = await readOptional(join(arcDir, path), io.readFile);
    if (content !== undefined) sources[key as keyof CheckProposalSources] = content;
  }
  const declarationPath = join(arcDir, "system", "arc-checks.yml");
  const existing = await readOptional(declarationPath, io.readFile);
  const proposal = extractCheckProposal(sources);
  if (existing === undefined) {
    const reference = editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml");
    if (reference.status !== "found") throw new Error("The check declaration has no editor-document reference.");
    await io.writeFile(declarationPath, `${reference.reference}\n${proposal.proposal}`);
  }
  return { written: existing === undefined, commands: proposal.commands, unextractable: proposal.unextractable };
}
/**
 * Render every extracted command and source requiring manual authoring.
 * @param report - Bootstrap outcome, absent when no surface retired
 * @returns Summary lines for the installing command
 */
export function checkBootstrapSummary(report: CheckBootstrapReport | null): string[] {
  if (report === null) return [];
  const lines = [report.written
    ? "Proposed checks written to .arc/system/arc-checks.yml; assign gates before they run."
    : "Existing .arc/system/arc-checks.yml preserved; carry these retired sources by hand."];
  for (const entry of report.commands) {
    lines.push(`  ${entry.command} (mapped gate: ${entry.mappedGate}; gate unset in proposal)`);
    lines.push(...entry.sources.map(source => `    Source: ${source}`));
  }
  for (const entry of report.unextractable) lines.push(`  Unextractable: ${entry.source}: ${entry.text}`);
  return lines;
}
