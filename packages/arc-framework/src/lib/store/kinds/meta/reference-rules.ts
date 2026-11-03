/** Changed metadata references are judged through the proposed store view. */
import { posix } from "node:path";
import { resolveArcPath } from "../../../layout/index.js";
import { parseCohortDocument } from "../cohort/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { SlugSchema } from "../../../kernel/index.js";
import type { Remedy } from "../../refusal.js";
import { brokenRule, observeRecord, observeNamedRecord } from "../rule-support.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check newly introduced dependency edges.
 * @param input - Proposed metadata write.
 * @returns Violations of dependency resolution.
 */
export async function checkMetaDependsOn(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input);
  const { next } = versions;
  if (next === undefined) return [];
  const changed = metaFieldChanged(versions, "dependsOn")
    ? next.dependsOn.filter((edge) => !versions.prior?.dependsOn.includes(edge)) : [];
  const wait = next.pause?.waitsOn, priorWait = versions.prior?.pause?.waitsOn;
  if (metaFieldChanged(versions, "pause") && wait?.kind === "work-unit"
    && !(priorWait?.kind === "work-unit" && priorWait.slug === wait.slug)) changed.push(wait.slug);
  const problems: string[] = [], repairs: Remedy[] = [];
  for (const edge of changed) {
    const slug = SlugSchema.safeParse(edge);
    if (!slug.success) { problems.push(`${edge}: expected a slug`); continue; }
    const resolved = await input.after.lookup({ kind: "slug", slug: slug.data });
    if (resolved.status === "refused") {
      problems.push(`${edge}: ${resolved.refusal.condition}`);
      if (resolved.refusal.code === "ambiguous-match") repairs.push(resolved.refusal.remedy);
    }
  }
  return problems.length === 0 ? [] : [{ rule: "meta.depends-on", condition: `Unresolved new dependencies: ${problems.join("; ")}.`,
    remedy: dependencyRemedy(repairs, problems.length) }];
}
function dependencyRemedy(repairs: readonly Remedy[], problems: number): Remedy {
  const fixed = "Use a current unambiguous work-item slug, remove the new edge, or repair unavailable store state and retry.";
  if (repairs.length === 0) return { text: fixed };
  const single = repairs[0];
  if (single !== undefined && problems === 1) return single;
  return { text: [...repairs.map(repair => repair.text), ...(problems > repairs.length ? [fixed] : [])].join(" "),
    argv: ["arc", "status", "--json"] };
}
/** Check newly introduced Design entries.
 * @param input - Proposed metadata write.
 * @returns Violations of own design references.
 */
export async function checkMetaDesignEntry(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input);
  const { next } = versions;
  if (next === undefined || !metaFieldChanged(versions, "design")) return [];
  const own = new Set((["draft", "spec"] as const).map((artifact) => posix.basename(resolveArcPath({ kind: "work-unit-artifact",
    slug: input.reference.owner.name, artifact, placement: { kind: "active", scope: { kind: "project" } } }))));
  const problems: string[] = next.design.length > 2 ? ["Design holds more than two entries"] : [];
  for (const entry of next.design.filter((value) => !versions.prior?.design.includes(value))) {
    if (own.has(entry)) continue;
    const key = (["spec-prd", "spec-rfc"] as const).find((key) => entry === `spec-${input.reference.owner.name}-${key.slice(5)}.md`);
    if (key === undefined) { problems.push(`${entry}: not an own design filename`); continue; }
    const companion = await observeRecord(input.after, recordReferences["work-item/companion"](input.reference.owner, key));
    if (companion.status !== "known") problems.push(`${entry}: ${companion.status === "unavailable" ? companion.condition : "own companion is absent"}`);
  }
  return problems.length === 0 ? [] : [brokenRule("meta.design-entry", problems.join("; "),
    "Use at most two own draft/spec filenames, or store the matching own paired-spec companion before retrying.")];
}
/** Check a changed cohort path against its open document.
 * @param input - Proposed metadata write.
 * @returns Violations of full-path cohort membership.
 */
export async function checkMetaCohort(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input);
  const { next } = versions;
  if (next === undefined || !metaFieldChanged(versions, "cohort") || next.cohort === null) return [];
  const path = next.cohort, parts = path.split("/");
  let problem: string | undefined;
  if (parts.length > 2 || !parts.every((part) => SlugSchema.safeParse(part).success)) problem = "expected one or two cohort slugs";
  else {
    const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: parts.at(-1) }));
    const record = await observeNamedRecord(input.after, reference);
    if (record.status === "ambiguous") return [{ rule: "meta.cohort", condition: `${path}: ${record.condition}.`, remedy: record.remedy }];
    if (record.status !== "known") problem = record.status === "unavailable" ? record.condition : "cohort document is absent";
    else if (record.value.placement?.kind === "completed") problem = "cohort is completed";
    else {
      const fields = parseCohortDocument(record.value.content);
      if (!fields.success) problem = fields.error;
      else if (fields.data.parent !== (parts.length === 2 ? parts[0] : null)) problem = "path disagrees with the cohort's Parent";
    }
  }
  return problem === undefined ? [] : [brokenRule("meta.cohort", `${path}: ${problem}.`,
    "Name an open cohort at its full parent/child path, repair its Parent, or clear Cohort and retry.")];
}
