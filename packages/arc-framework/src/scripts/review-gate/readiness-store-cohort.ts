/** Cohort coordination and authored closeout checks over complete stored inventories. */
import type { Store } from "../../lib/store/contract.js";
import type { StoreRecord } from "../../lib/store/read.js";
import type { LifecycleEntry } from "../../lib/store/lifecycle-index.js";
import { parseCohortDocument, type ParsedCohortDocument } from "../../lib/store/kinds/cohort/index.js";
import type { ReviewReadinessFact } from "./readiness.js";
import { validCohortCloseout } from "./readiness-artifact-facts.js";
import { describeRecordConflicts } from "../../lib/store/conflict-diagnostics.js";

interface Document { record: StoreRecord; fields: ParsedCohortDocument }
function fact(code: string, path: string, message: string): ReviewReadinessFact { return { code, path, message }; }

async function readDocuments(store: Store): Promise<{ documents: Document[]; facts: ReviewReadinessFact[] }> {
  const result = await store.list({ family: "cohort", kind: "cohort/document" }), path = "cohort/document";
  if (result.status === "refused") {
    return { documents: [], facts: [fact("unreadable-artifact", path, `${result.refusal.condition} ${result.refusal.remedy.text}`)] };
  }
  const listed = result.result;
  if (listed.status === "unreadable") return { documents: [], facts: [fact("unreadable-artifact", path, `${listed.condition} ${listed.remedy.text}`)] };
  if (listed.status === "absent") return { documents: [], facts: [] };
  const facts = listed.diagnostics.map(diagnostic => fact("malformed-artifact", diagnostic.key,
    `${diagnostic.condition} ${diagnostic.remedy.text}`));
  if (listed.missed) facts.push(fact("unreadable-artifact", path, "The cohort inventory missed records. Repair the cohort inventory, then retry."));
  const documents: Document[] = [];
  for (const record of listed.records) {
    const parsed = parseCohortDocument(record.content);
    if (!parsed.success) facts.push(fact("malformed-artifact", `${path}:${record.reference.owner.name}`, parsed.error));
    else if (record.conflicts.length > 0) {
      facts.push(fact("malformed-artifact", `${path}:${record.reference.owner.name}`,
        `The stored cohort has unresolved conflicts.${describeRecordConflicts(record.conflicts)}`));
    }
    else documents.push({ record, fields: parsed.data });
  }
  return { documents, facts };
}

function coordinateFacts(coordinate: string, finalSlug: string, entries: readonly LifecycleEntry[],
  documents: readonly Document[]): ReviewReadinessFact[] {
  const name = coordinate.split("/").at(-1) ?? coordinate, path = `cohort/document:${name}`;
  const matches = documents.filter(document => document.record.reference.owner.name === name);
  if (matches.length > 1) return [fact("malformed-artifact", path, "The cohort name resolves to multiple stored documents.")];
  const document = matches[0];
  const open = entries.some(entry => entry.location !== "completed"
    && (entry.fields.cohort === coordinate || entry.fields.cohort?.startsWith(`${coordinate}/`) === true))
    || documents.some(other => other.record.placement?.kind !== "completed" && other.fields.parent === name);
  if (open) return document !== undefined && document.record.placement?.kind !== "completed" ? []
    : [fact("missing-cohort-coordination", path, "An open cohort requires its stored coordination document.")];
  if (document === undefined) return [fact("missing-cohort-closeout", path, "The final cohort member requires its stored closeout document.")];
  if (document.record.placement?.kind !== "completed") return [fact("incomplete-cohort-closeout", path,
    "The final cohort member shipped but its coordination document remains planned.")];
  return validCohortCloseout(document.record.content, finalSlug) ? []
    : [fact("malformed-cohort-closeout", path, "The cohort closeout section is malformed.")];
}

/** Check the work unit's cohort and its parent against current membership and completed documents. */
export async function storedCohortReadinessFacts(store: Store, entries: readonly LifecycleEntry[],
  cohort: string | null, finalSlug: string): Promise<ReviewReadinessFact[]> {
  if (cohort === null) return [];
  const { documents, facts } = await readDocuments(store);
  if (facts.length > 0) return facts;
  const result = coordinateFacts(cohort, finalSlug, entries, documents);
  const parent = cohort.includes("/") ? cohort.split("/")[0] : undefined;
  if (parent !== undefined) result.push(...coordinateFacts(parent, finalSlug, entries, documents));
  return result;
}
