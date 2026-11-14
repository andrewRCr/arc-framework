/** Inject a store change between a writer's preparation and its batch, and hold the batch to fresh preparation. */
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { BatchInput } from "../../../src/lib/store/write.js";
import type { StoreResult } from "../../../src/lib/store/refusal.js";
import type { BatchResult } from "../../../src/lib/store/write.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";

/**
 * One prepared store writer: it reads, prepares, and submits through whichever store it is given. A writer whose
 * preparation produces nothing to submit returns without a batch.
 */
export interface FenceWriter {
  readonly name: string;
  run(store: Store): Promise<unknown>;
}

/** One read a writer took before its batch, named by operation and record or kind, with the record it read. */
export interface FenceRead { readonly operation: "read" | "list" | "lookup"; readonly target: string; readonly reference?: RecordReference }

/** A fresh run's batch result, or what the writer returned when fresh preparation produced no batch to submit. */
export type FenceRetry = StoreResult<BatchResult> | { status: "unprepared"; returned: unknown };
/** What the batch did with a change landed between preparation and submission, and what a fresh run then did. */
export type FenceOutcome = { kind: "refused"; condition: string; retried: FenceRetry } | { kind: "admitted" };

const DRY_RUN = "fence.dry-run";

/** Delegate every store member, replacing only the ones given. */
export function overStore(store: Store, members: Partial<Pick<Store, "read" | "list" | "lookup" | "batch">>): Store {
  return new Proxy(store, { get(target, key) {
    if (key in members) return members[key as keyof typeof members];
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function describeRead(operation: FenceRead["operation"], input: unknown): FenceRead {
  const value = input as { reference?: { kind: string; owner: { name: string }; key?: unknown }; kind?: string; family?: string;
    slug?: string; claim?: { slug: string } };
  if (value.reference !== undefined) {
    const key = value.reference.key === undefined ? "" : `/${JSON.stringify(value.reference.key)}`;
    return { operation, target: `${value.reference.kind}:${value.reference.owner.name}${key}`, reference: value.reference as RecordReference };
  }
  if (operation === "list") return { operation, target: value.kind ?? value.family ?? "?" };
  return { operation, target: value.slug ?? value.claim?.slug ?? canonicalize(input) };
}

/** Run a writer to its first batch without landing anything, returning what it read and the batch it prepared. */
export async function dryRun(store: Store, writer: FenceWriter): Promise<{ reads: FenceRead[]; batch: BatchInput | undefined }> {
  const reads: FenceRead[] = [];
  let batch: BatchInput | undefined;
  const recorded = overStore(store, {
    read: async input => { if (batch === undefined) reads.push(describeRead("read", input)); return store.read(input); },
    list: async input => { if (batch === undefined) reads.push(describeRead("list", input)); return store.list(input); },
    lookup: async input => { if (batch === undefined) reads.push(describeRead("lookup", input)); return store.lookup(input); },
    batch: async input => {
      batch ??= input;
      return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.writes[0]?.reference
        ?? { kind: "work-item/meta", owner: { type: "work-item", name: "fence" } }, rule: DRY_RUN,
      condition: "The fence harness captured this batch without landing it.", remedy: { text: "None; this is a dry run." } } } as StoreResult<BatchResult>;
    },
  });
  await writer.run(recorded);
  return { reads: [...new Map(reads.map(read => [`${read.operation} ${read.target}`, read])).values()], batch };
}

/** The records a batch writes, named by reference. */
export function preparedTargets(batch: BatchInput | undefined): string {
  return batch === undefined ? "no batch" : canonicalize(batch.writes.map(write => write.reference).sort((left, right) =>
    canonicalize(left).localeCompare(canonicalize(right))));
}

/**
 * Whether the store now holds what each prepared write would land: a stale expected version merges rather than refuses,
 * so an admitted batch is held to the records it leaves, not to its submitted bytes.
 */
async function landedDifference(store: Store, prepared: BatchInput): Promise<string | undefined> {
  for (const write of prepared.writes) {
    const landed = await store.read({ reference: write.reference });
    const name = `${write.reference.kind}:${write.reference.owner.name}`;
    if (write.action === "remove") {
      if (landed.status === "ok" || landed.refusal.code !== "not-found") return `${name} remains`;
      continue;
    }
    if (landed.status !== "ok") return `${name} is unreadable: ${landed.refusal.condition}`;
    if (landed.result.content !== write.content) return `${name}'s content differs`;
    const placement = (landed.result.placement ?? {}) as Record<string, unknown>;
    if (Object.entries(write.placement ?? {}).some(([key, value]) => canonicalize(placement[key]) !== canonicalize(value))) return `${name}'s placement differs`;
    if (write.links !== undefined && canonicalize(landed.result.links) !== canonicalize(write.links)) return `${name}'s links differ`;
  }
  return undefined;
}

/**
 * Land a change after the writer prepares and before its first batch is submitted, then hold the batch to the fence.
 *
 * The batch either refuses with nothing written, returning what a fresh run then does, or admits a batch that leaves
 * exactly the records preparing against the changed store would land.
 */
export async function runFenceCase(store: Store, writer: FenceWriter, change: (store: Store) => Promise<void>): Promise<FenceOutcome> {
  let submitted: BatchInput | undefined, fresh: BatchInput | undefined, result: StoreResult<BatchResult> | undefined;
  let changed: unknown;
  const fenced = overStore(store, { batch: async input => {
    if (submitted !== undefined) return store.batch(input);
    submitted = input;
    await change(store);
    changed = await store.version();
    fresh = (await dryRun(store, writer)).batch;
    return result = await store.batch(input);
  } });
  await writer.run(fenced);
  if (submitted === undefined || result === undefined) throw new Error(`${writer.name} reached no batch.`);
  if (result.status === "ok") {
    const difference = fresh === undefined ? "fresh preparation reaches no batch"
      : preparedTargets(submitted) !== preparedTargets(fresh) ? "fresh preparation writes other records" : await landedDifference(store, fresh);
    if (difference !== undefined) throw new Error(`${writer.name} admitted a batch fresh preparation would not land: ${difference}.`);
    return { kind: "admitted" };
  }
  if (canonicalize(await store.version()) !== canonicalize(changed)) throw new Error(`${writer.name} refused but wrote.`);
  let retried: StoreResult<BatchResult> | undefined;
  const returned = await writer.run(overStore(store, { batch: async input => {
    const landed = await store.batch(input);
    retried ??= landed;
    return landed;
  } }));
  return { kind: "refused", condition: result.refusal.condition, retried: retried ?? { status: "unprepared", returned } };
}
