/** Resolve tracked paths through the import's record discovery and operational source selection. */
import type { WindowImportContext } from "./import-context.js";
import type { ComposedLifecycleIndexResult } from "../../lib/work-unit/composed-lifecycle-index.js";
import { RecordReferenceSchema, type RecordReference } from "../../lib/store/identity.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import { createInRepoContext, type InRepoContext } from "../../lib/store/in-repo/context.js";
import { composedMetas, composedMetaSource, heldMetaSources } from "../../lib/store/in-repo/meta.js";
import { cohortPaths, companionNames, internalReferences, recordPath } from "../../lib/store/in-repo/paths.js";
import { readWindowRefTip } from "./git.js";
import { readImportParkedSources } from "../../lib/store/ref/import/parked-source.js";
import type { MigrateReport } from "../../lib/store/commands.js";
import { parseMetaRecord } from "../../lib/active/meta-reader.js";
import { basename } from "node:path";

/** A tracked file's logical owner and exact import read coordinate. */
export interface WindowPathRead {
  path: string; reference: RecordReference | null; workUnit: string | null;
  readRevision: string | null; readCopyRef: string | null;
  pointerBranch?: string | null;
}
/** Operation-owned discovery, including explicit unavailable import sources. */
export interface WindowReadMap {
  main: string; findings: WindowFinding[];
  readRevisions: readonly string[];
  records(revision: string): Promise<ReadonlyMap<string, RecordReference>>;
  at(path: string, revision: string, comparisonBases?: readonly string[]): Promise<WindowPathRead>;
}

/** Acquire an import-aligned mapping without running a migration or writing repository state. */
export async function createWindowReadMap(context: WindowImportContext, main: string,
  composition?: ComposedLifecycleIndexResult): Promise<WindowReadMap> {
  const internal = createInRepoContext(context.importSource.ports);
  const selectedComposition = composition ?? await composedMetas(internal);
  const { sources, pointers, findings } = await readSources(context, internal, selectedComposition, main);
  const readRevisions = [...new Set([...sources.values()].flatMap(source => source.readRevision === null ? [] : [source.readRevision]))];
  const inventories = new Map<string, Promise<Map<string, RecordReference>>>();
  const inventory = (revision: string) => {
    let found = inventories.get(revision);
    if (!found) { found = discoverWindowPaths(internal, revision); inventories.set(revision, found); }
    return found;
  };
  return { main, findings, readRevisions, records: inventory, at: async (path, revision, bases = []) => {
    let reference: RecordReference | null = null;
    for (const candidate of [revision, ...bases, ...readRevisions]) {
      reference = (await inventory(candidate)).get(path) ?? null;
      if (reference !== null) break;
    }
    return resolveWindowPathRead({ path, reference, main, source: reference === null ? undefined : sources.get(reference.owner.name),
      ...pointers.has(path) ? { pointerBranch: pointers.get(path) ?? null } : {} });
  } };
}

type ReadCoordinate = Pick<WindowPathRead, "readRevision" | "readCopyRef">;

/** Select one discovered path's import coordinate, retaining unavailable live reads and main-owned exceptions. */
export function resolveWindowPathRead(input: { path: string; reference: RecordReference | null; main: string;
  source?: ReadCoordinate; pointerBranch?: string | null }): WindowPathRead {
  const { path, reference, main, pointerBranch } = input;
  const workUnit = reference?.owner.type === "work-item" ? reference.owner.name : null;
  const selected = pointerBranch === undefined && reference?.kind !== "lineage/transition" && workUnit !== null ? input.source : undefined;
  return { path, reference, workUnit, ...(selected ?? { readRevision: main, readCopyRef: "refs/heads/main" }),
    ...pointerBranch !== undefined ? { pointerBranch } : {} };
}

async function readSources(context: WindowImportContext, internal: InRepoContext,
  selectedComposition: ComposedLifecycleIndexResult, main: string): Promise<{
    sources: Map<string, ReadCoordinate>; pointers: Map<string, string | null>; findings: WindowFinding[];
  }> {
  const sources = await readComposedSources(context, internal, selectedComposition, main);
  const report: MigrateReport = { move: "import", refs: [], refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: [] };
  const parked = await readImportParkedSources(context, internal, report, main);
  for (const slug of parked.names) sources.set(slug, { readRevision: null, readCopyRef: null });
  const pointers = new Map<string, string | null>(), pointerBranches = new Map<string, string | null>();
  for (const meta of await heldMetaSources(internal, main)) {
    if (!parked.names.has(meta.slug) || meta.content === null) continue;
    const branch = parseMetaRecord(meta.content).branch;
    pointers.set(meta.path, branch); pointerBranches.set(meta.slug, branch);
  }
  for (const entry of parked.available) {
    const branch = pointerBranches.get(entry.meta.reference.owner.name);
    if (!branch) throw new WindowRefusal([{ subject: entry.meta.reference.owner.name,
      condition: "The acquired parked source has no committed pointer branch.",
      remedy: "Restore the committed parking pointer before retrying the read map." }]);
    const localRef = `refs/heads/${branch}`;
    const local = await readWindowRefTip({ repo: context.checkoutRoot, exec: context.exec }, localRef);
    sources.set(entry.meta.reference.owner.name, { readRevision: entry.revision,
      readCopyRef: local === entry.revision ? localRef : `refs/remotes/origin/${branch}` });
  }
  const findings = report.notices.map(notice => ({ subject: "parked import source", condition: notice.condition,
    remedy: notice.remedy?.text ?? "Restore the readable committed parking pointer and branch, then retry." }));
  return { sources, pointers, findings };
}

async function readComposedSources(context: WindowImportContext, internal: InRepoContext,
  selectedComposition: ComposedLifecycleIndexResult, main: string): Promise<Map<string, ReadCoordinate>> {
  const sources = new Map<string, ReadCoordinate>();
  for (const [slug, row] of selectedComposition.recordsBySlug) {
    if (row.selected.location === "completed") continue;
    const source = await composedMetaSource(internal, slug, selectedComposition);
    if (!source) continue;
    const ref = source.revision ?? "refs/heads/main";
    sources.set(slug, { readCopyRef: ref, readRevision: source.revision === undefined ? main
      : await readWindowRefTip({ repo: context.checkoutRoot, exec: context.exec }, `${ref}^{commit}`) });
  }
  return sources;
}

async function discoverWindowPaths(context: InRepoContext, revision: string): Promise<Map<string, RecordReference>> {
  const paths = new Map<string, RecordReference>();
  const roles = Object.values(context.registry).filter(kind => kind.family === "work-item"
    && kind.inRepo.substrate === "tracked" && kind.inRepo.address?.artifact !== undefined);
  for (const meta of await heldMetaSources(context, revision)) {
    const owner = { type: "work-item", name: meta.slug };
    for (const kind of roles) {
      const reference = RecordReferenceSchema.parse({ kind: kind.id, owner });
      paths.set(await recordPath(context, reference, meta, revision), reference);
    }
    for (const key of await companionNames(context, meta)) {
      const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key });
      paths.set(await recordPath(context, reference, meta, revision), reference);
    }
  }
  for (const kind of ["review/candidate", "review/integration-boundary", "lineage/transition"] as const) {
    for (const entry of await internalReferences(context, kind, revision)) paths.set(entry.path, entry.reference);
  }
  for (const path of await cohortPaths(context, revision)) {
    const reference = RecordReferenceSchema.safeParse({ kind: "cohort/document",
      owner: { type: "cohort", name: basename(path).slice("cohort-".length, -".md".length) } });
    if (reference.success) paths.set(path, reference.data);
  }
  const inbox = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
  paths.set(await recordPath(context, inbox, undefined, revision), inbox);
  return paths;
}
