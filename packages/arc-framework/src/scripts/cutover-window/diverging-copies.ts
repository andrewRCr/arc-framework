/** Refuse non-stale live copies whose commits the import's selected copy does not contain. */
import type { InFlightBranchProvenance } from "../../lib/git/in-flight-derivation.js";
import { windowImportReport, type WindowImportContext } from "./import-context.js";
import type { ComposedLifecycleIndexResult } from "../../lib/work-unit/composed-lifecycle-index.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import { readWindowRefTip } from "./git.js";
import { createInRepoContext } from "../../lib/store/in-repo/context.js";
import { composedMetaSource } from "../../lib/store/in-repo/meta.js";
import { readImportParkedSources } from "../../lib/store/ref/import/parked-source.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";

/** Compare all provenance copies with the operational source, leaving parked selection to the import. */
export async function readWindowDivergingCopyFindings(context: WindowImportContext, main: string | undefined,
  composition: ComposedLifecycleIndexResult): Promise<WindowFinding[]> {
  if (main === undefined) throw new WindowRefusal([{ subject: "main", condition: "The importing main revision is unavailable.",
    remedy: "Restore main and retry check." }]);
  const internal = createInRepoContext(context.importSource.ports);
  const report = windowImportReport();
  const parked = await readImportParkedSources(context, internal, report, main), findings: WindowFinding[] = [];
  for (const [slug, record] of composition.recordsBySlug) {
    if (record.selected.location === "completed" || parked.names.has(slug)) continue;
    const source = await composedMetaSource(internal, slug, composition);
    findings.push(...await sourceCopyFindings(context, slug, source?.revision, main, composition.provenanceBySlug?.get(slug) ?? []));
  }
  return findings;
}

async function sourceCopyFindings(context: WindowImportContext, slug: string, revision: string | undefined,
  main: string, copies: readonly InFlightBranchProvenance[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  const selectedRef = revision ?? "refs/heads/main";
  const selected = revision === undefined ? main : await readWindowRefTip({ repo: context.checkoutRoot, exec: context.exec }, selectedRef);
  for (const copy of copies) {
    if (copy.relation === "stale") continue;
    const tip = await readWindowRefTip({ repo: context.checkoutRoot, exec: context.exec }, copy.ref);
    const condition = tip === null || selected === null
      ? `Cannot resolve copy ${copy.ref} or selected read copy ${selectedRef}.`
      : await containmentCondition(context, copy.ref, tip, selectedRef, selected);
    if (condition) findings.push({ subject: slug, condition,
      remedy: tip === null || selected === null ? "Restore the named refs and readable commits, then retry check."
        : "Merge the passed-over copy into the selected read copy and push both sides into agreement, or drop a local-only copy's commits; then retry check." });
  }
  return findings;
}

async function containmentCondition(context: WindowImportContext, ref: string, tip: string,
  selectedRef: string, selected: string): Promise<string | null> {
  try {
    await context.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", tip, selected],
      { cwd: context.checkoutRoot, objectAccess: "local-only" });
    return null;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) {
      return `Copy ${ref} (${tip}) is not an ancestor of selected read copy ${selectedRef} (${selected}).`;
    }
    throw new WindowRefusal([{ subject: `${ref} / ${selectedRef}`,
      condition: `Cannot read copy ancestry: ${String(error)}`,
      remedy: "Restore Git access and the named readable commits, then retry check." }]);
  }
}
