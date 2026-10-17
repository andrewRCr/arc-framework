/** Independent source and destination copies for record-by-record import comparison. */
import { importFixture } from "./import-fixture.js";
import { createRefStore, createStore } from "../../../src/lib/store/create.js";
import { isDeepStrictEqual } from "node:util";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { resolveCallerComposedLifecycleIndex } from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import { KIND_REGISTRY } from "../../../src/lib/store/registry.js";
import { StateVersionSchema } from "../../../src/lib/store/identity.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import type { Store, ReadOnlyStore } from "../../../src/lib/store/contract.js";
import type { KindId } from "../../../src/lib/store/catalog.js";
import type { StoreRecord, ListInput, ListingDiagnostic } from "../../../src/lib/store/read.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { basename } from "node:path";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";

/** One observable disagreement; record versions are deliberately excluded. */
export interface ImportDifference { reference: RecordReference; field: string; expected?: unknown; actual?: unknown; condition?: string }
/** Each source's documented transformation normalizes only the fields it owns. */
export type ImportComparator = (expected: StoreRecord, actual: StoreRecord) =>
  { expected: StoreRecord; actual: StoreRecord } | Promise<{ expected: StoreRecord; actual: StoreRecord }>;

/** Arrange independent copies before any import can delete or re-home source data. */
export async function importComparisonFixture(layout: "default" | "separate" = "default",
  prepare?: (fixture: Awaited<ReturnType<typeof importFixture>>) => Promise<void>) {
  const [source, target] = await Promise.all([importFixture(layout), importFixture(layout)]);
  if (prepare) { await prepare(source); await prepare(target); }
  const store = createRefStore(target.ports);
  const ports = { ...createDefaultStorePorts(source.ports), ...source.ports };
  const sourceStore = createStore(ports);
  const comparators = new Map<KindId, ImportComparator>();
  return { source, target, store, comparators, compare: async (): Promise<ImportDifference[]> => {
    const inventory = await readComparisonSource(sourceStore, ports);
    return compareRecords(sourceStore, store, inventory, comparators);
  } };
}

interface SourceDiagnostic { kind: KindId; diagnostic: ListingDiagnostic; input: ListInput }
interface ComparisonSource { records: StoreRecord[]; diagnostics: SourceDiagnostic[] }

async function readComparisonSource(store: ReadOnlyStore, ports: ReturnType<typeof createDefaultStorePorts>): Promise<ComparisonSource> {
  const inventory: ComparisonSource = { records: [], diagnostics: [] };
  const composition = await resolveCallerComposedLifecycleIndex({ cwd: ports.checkoutRoot, fs: ports.fs,
    exec: ports.exec, identity: await ports.identity(), acquisitionPolicy: "local" });
  const head = StateVersionSchema.parse((await ports.exec("git", ["rev-parse", "HEAD^{tree}"], { cwd: ports.checkoutRoot })).stdout.trim());
  const metas = await listing(store, { family: "work-item", kind: "work-item/meta" });
  for (const definition of Object.values(KIND_REGISTRY)) {
    if (definition.inRepo.substrate !== "tracked" && definition.inRepo.substrate !== "personal") continue;
    if (definition.family === "review") {
      for (const meta of metas.records) {
        const selected = composition.recordsBySlug.get(meta.reference.owner.name);
        const path = selected?.writablePath ?? selected?.selected.source.path;
        const delimiter = path?.indexOf(":.arc/") ?? -1;
        const revision = delimiter < 0 ? undefined : path?.slice(0, delimiter);
        const asOf = revision === undefined ? undefined : StateVersionSchema.parse((await ports.exec("git",
          ["rev-parse", `${revision}^{tree}`], { cwd: ports.checkoutRoot })).stdout.trim());
        await appendSourceListing(store, inventory, { family: definition.family, kind: definition.id, owner: meta.reference.owner, asOf });
      }
    } else {
      const asOf = definition.inRepo.substrate === "tracked" && definition.family !== "work-item" ? head : undefined;
      await appendSourceListing(store, inventory, { family: definition.family, kind: definition.id, asOf });
    }
  }
  return inventory;
}

async function appendSourceListing(store: ReadOnlyStore, inventory: ComparisonSource, input: ListInput & { kind: KindId }): Promise<void> {
  const result = await listing(store, input);
  inventory.records.push(...result.records);
  inventory.diagnostics.push(...result.diagnostics.map((diagnostic) => ({ kind: input.kind, diagnostic, input })));
}

async function listing(store: ReadOnlyStore, input: ListInput): Promise<{ records: StoreRecord[]; diagnostics: ListingDiagnostic[] }> {
  const result = await store.list(input);
  if (result.status === "refused") throw new Error(`Source comparison refused: ${result.refusal.condition}`);
  if (result.result.status === "unreadable") throw new Error(`Source comparison incomplete: ${result.result.condition}`);
  return result.result.status === "complete" ? result.result : { records: [], diagnostics: [] };
}

async function compareRecords(sourceStore: ReadOnlyStore, store: Store, source: ComparisonSource, comparators: ReadonlyMap<KindId, ImportComparator>): Promise<ImportDifference[]> {
  const differences: ImportDifference[] = [];
  for (const expected of source.records) {
    const actual = await store.read({ reference: expected.reference });
    if (actual.status === "refused") {
      differences.push({ reference: expected.reference, field: "record", condition: actual.refusal.condition });
      continue;
    }
    differences.push(...await comparePair(expected, actual.result, comparators));
  }
  for (const diagnostic of source.diagnostics) differences.push(...await compareDiagnostic(sourceStore, store, diagnostic, comparators));
  return differences;
}

async function comparePair(expected: StoreRecord, actual: StoreRecord, comparators: ReadonlyMap<KindId, ImportComparator>): Promise<ImportDifference[]> {
  const pair = { expected: normalizeRecord(expected), actual: normalizeRecord(actual) };
  const comparator = comparators.get(expected.reference.kind);
  const normalized = comparator ? await comparator(pair.expected, pair.actual) : pair;
  return recordDifferences(normalized.expected, normalized.actual);
}

async function compareDiagnostic(source: ReadOnlyStore, target: Store, row: SourceDiagnostic,
  comparators: ReadonlyMap<KindId, ImportComparator>): Promise<ImportDifference[]> {
  if (KIND_REGISTRY[row.kind].family !== "review" && row.kind !== "lineage/transition") {
    throw new Error(`The comparison cannot address source diagnostic ${row.diagnostic.key}: ${row.diagnostic.condition}`);
  }
  const reference = diagnosticReference(row);
  const raw = await source.read({ reference, asOf: row.input.asOf });
  if (raw.status === "refused") throw new Error(`The diagnostic's source bytes are unreadable: ${raw.refusal.condition}`);
  const listed = await listing(target, { family: KIND_REGISTRY[row.kind].family, kind: row.kind, owner: reference.owner });
  const actual = listed.records.find((record) => sameLogicalReference(record.reference, reference));
  if (actual) return comparePair(raw.result, actual, comparators);
  const found = await target.lookup({ kind: "slug", slug: SlugSchema.parse(reference.owner.name) });
  if (found.status === "ok") {
    const primary = await target.read({ reference: found.result.reference });
    if (primary.status === "ok") {
      const home = expandStoredPath({ ...reference, owner: found.result.reference.owner }, { placement: primary.result.placement });
      if (listed.diagnostics.some(({ key, kind }) => key === home.path && kind === row.diagnostic.kind)) return [];
    }
  }
  return [{ reference, field: "diagnostic", condition: `The source diagnostic at ${row.diagnostic.key} has no matching imported record or diagnostic.` }];
}

function diagnosticReference(row: SourceDiagnostic): RecordReference {
  const suffix = row.kind === "review/integration-boundary" ? /\.boundary\.json$/u : /\.json$/u;
  const name = SlugSchema.parse(row.input.owner?.name ?? basename(row.diagnostic.key).replace(suffix, ""));
  const path = row.kind === "review/candidate" ? resolveArcPath({ kind: "candidate-record", slug: name })
    : row.kind === "review/integration-boundary" ? resolveArcPath({ kind: "integration-boundary-record", slug: name })
      : resolveArcPath({ kind: "transition-record", origin: name });
  if (path !== row.diagnostic.key) throw new Error(`The comparison cannot match source diagnostic ${row.diagnostic.key}`);
  return RecordReferenceSchema.parse({ kind: row.kind, owner: { type: "work-item", name } });
}

function sameLogicalReference(left: RecordReference, right: RecordReference): boolean {
  return left.kind === right.kind && left.owner.type === right.owner.type && left.owner.name === right.owner.name
    && isDeepStrictEqual(left.key, right.key);
}

function normalizeRecord(record: StoreRecord): StoreRecord {
  const definition = KIND_REGISTRY[record.reference.kind];
  const content = definition.merge === "entry" ? record.content.replace(/^[ \t]*(?:- )?_Id:_ `[0-9a-f]{8}`[ \t]*(?:\r?\n|$)/gmu, "")
    : definition.projection === "never" ? canonicalize(JSON.parse(record.content)) : record.content;
  return { ...record, content };
}

function recordDifferences(expected: StoreRecord, actual: StoreRecord): ImportDifference[] {
  const differences: ImportDifference[] = [];
  const add = (field: string, left: unknown, right: unknown) => {
    if (!isDeepStrictEqual(left, right)) differences.push({ reference: expected.reference, field, expected: left, actual: right });
  };
  add("content", expected.content, actual.content);
  if (expected.placement !== undefined) add("placement", expected.placement, actual.placement);
  if (expected.fields !== undefined && actual.fields !== undefined) {
    const left = objectFields(expected.fields), right = objectFields(actual.fields);
    if (left && right) for (const key of Object.keys(left).filter((key) => Object.hasOwn(right, key))) add(`fields.${key}`, left[key], right[key]);
    else add("fields", expected.fields, actual.fields);
  }
  return differences;
}

function objectFields(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
