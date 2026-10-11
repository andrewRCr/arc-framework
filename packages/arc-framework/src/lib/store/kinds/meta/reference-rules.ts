/** Changed metadata references are judged through the proposed store view. */
import { posix } from "node:path";
import { resolveArcPath } from "../../../layout/index.js";
import { parseCohortDocument } from "../cohort/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { SlugSchema } from "../../../kernel/index.js";
import { brokenRule, observeRecord } from "../rule-support.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check newly introduced dependency edges.
 * @param input - Proposed metadata write.
 * @returns Violations of dependency resolution.
 */
export async function checkMetaDependsOn(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input);
  const { next } = versions;
  if (next === undefined || !metaFieldChanged(versions, "dependsOn")) return [];
  const changed = next.dependsOn.filter((edge) => !versions.prior?.dependsOn.includes(edge));
  const problems: string[] = [];
  for (const edge of changed) {
    const slug = SlugSchema.safeParse(edge);
    if (!slug.success) { problems.push(`${edge}: expected a slug`); continue; }
    const resolved = await input.after.lookup({ kind: "slug", slug: slug.data });
    if (resolved.status === "refused") problems.push(`${edge}: ${resolved.refusal.condition}`);
  }
  return problems.length === 0 ? [] : [brokenRule("meta.depends-on", `Unresolved new dependencies: ${problems.join("; ")}.`,
    "Use a current unambiguous work-item slug, remove the new edge, or repair unavailable store state and retry.")];
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
    const record = await observeRecord(input.after, reference);
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
