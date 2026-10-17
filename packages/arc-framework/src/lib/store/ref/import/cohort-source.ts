/** Recover a closed cohort's legacy archive coordinate through the layout authority. */
import { basename } from "node:path";
import { resolveArcPath } from "../../../layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../../kernel/index.js";
import { RecordReferenceSchema, type StateVersion } from "../../identity.js";
import type { ReadPlacement } from "../../placement.js";
import type { MigrateReport } from "../../commands.js";
import type { RefBackendContext } from "../context.js";
import { cohortPaths } from "../../in-repo/paths.js";

/** Open cohorts have no completed placement; closed cohorts retain their number and closeout suffix. */
export async function importCohortPlacements(context: RefBackendContext, report: MigrateReport, revision?: StateVersion): Promise<Map<string, ReadPlacement>> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const root = `${resolveArcPath({ kind: "placement-root", tier: "completed" })}/`;
  const placements = new Map<string, ReadPlacement>();
  for (const path of await cohortPaths({ ports: source.ports, registry: context.registry }, revision)) {
    if (!path.startsWith(root)) continue;
    const name = SlugSchema.safeParse(/^cohort-(.+)\.md$/u.exec(basename(path))?.[1]);
    if (!name.success) continue;
    const [quarter, folder] = path.slice(root.length).split("/");
    const match = /^([0-9]+)([ab])_cohort-(.+)$/u.exec(folder ?? "");
    const q = ArchiveQuarterSchema.safeParse(quarter), sequence = ArchiveSequenceSchema.safeParse(match?.[1]);
    if (!q.success || !sequence.success || match?.[3] !== name.data) {
      report.refused.push({ reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: name.data } }), rule: "key" });
      continue;
    }
    placements.set(name.data, { kind: "completed", quarter: q.data, sequence: sequence.data, closeout: match[2] === "a" ? "a" : "b" });
  }
  return placements;
}
