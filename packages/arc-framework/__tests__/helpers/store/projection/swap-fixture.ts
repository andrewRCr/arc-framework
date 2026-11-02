/**
 * A projected file ready to swap — its record's next version stored and staged, and the replace guard's decision to
 * replace it — or to remove, the guard re-checking it with nothing staged, each with a batch over a seeded projection in
 * a new temporary repository.
 */
import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createReferenceFixture } from "../reference-fixture.js";
import { seedProjection } from "./seeded-projection.js";
import { recordLandedCopy } from "./take-in-recording.js";
import { recordWriteBackSent } from "../../../../src/lib/store/projection/aside-copies.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readReference, readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { swapBatch, type SwapBatchInput } from "../../../../src/lib/store/projection/swap.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

/** The projected Markdown file a swap test replaces unless it names another. */
export const SWAP_PATH = ".arc/backlog/planned/one/cohort-one.md";
/** The process a swap test's copies and staged files name. */
export const SWAP_WRITER = { pid: process.pid, processInstance: "swap-test", processScope: "pid:[swap-test]" };
const PROVENANCE = { verb: "save", lifecycleAction: "save" } as const;

/** A take-in that defers every edit. */
export const deferring: TakeInPort = async (request) => ({ answer: "deferred", entry: request.entry });

/** What a prepared swap holds the file to. */
export interface PrepareSwapOptions {
  readonly path?: string;
  /** The record's content as laid, then as stored next. */
  readonly contents?: readonly [string, string];
  /** Whether the file, and the version staged for it, are read-only, as a protected file is. */
  readonly readOnly?: boolean;
  /** Something done to the file before the guard re-checks it, and the take-in the guard calls. */
  readonly guarded?: { readonly before?: (file: string) => Promise<void>; readonly takeIn?: TakeInPort };
}

/**
 * Prepare one file's swap; the caller removes the checkout the result names.
 * @param options - The file, its contents, and what happens before the guard.
 * @returns The store, the seeded projection, the file's entry as laid, what is staged, and a batch that swaps it.
 */
export async function prepareSwap(options: PrepareSwapOptions = {}) {
  const path = options.path ?? SWAP_PATH;
  const contents = options.contents ?? ["# Cohort: one\n\nBody.\n", "# Cohort: one\n\nBody, refreshed.\n"];
  const readOnly = options.readOnly ?? false;
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document", "one");
  const put = await fixture.store.write({ action: "put", reference, content: contents[0], expected: null, provenance: PROVENANCE });
  if (put.status !== "ok") throw new Error("the fixture write was refused");
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path }] });
  const laid = seeded.index.entries[path];
  if (laid?.kind !== "record") throw new Error("expected the file's record entry");
  const next = await fixture.store.write({ action: "put", reference, content: contents[1], expected: laid.base.version, provenance: PROVENANCE });
  if (next.status !== "ok") throw new Error("the fixture write was refused");
  const record = await fixture.store.read({ reference });
  if (record.status !== "ok") throw new Error("the fixture read was refused");
  if (readOnly) await chmod(join(seeded.checkout, path), 0o444);
  await options.guarded?.before?.(join(seeded.checkout, path));
  const staged = await stageRecordFile({
    checkout: seeded.checkout, path, record: record.result, replacing: laid.base.blob, writer: SWAP_WRITER, format: "sha1", readOnly,
  });
  const replace = await guardReplacement({
    checkout: seeded.checkout, path, entry: laid, staged, reference: await readReference(seeded.checkout), format: "sha1",
    store: fixture.store, writer: SWAP_WRITER, takeIn: options.guarded?.takeIn ?? deferring,
  });
  if (replace.kind !== "replace") throw new Error("expected the guard to replace the file");
  const file = join(seeded.checkout, path);
  const swap = (overrides: Partial<SwapBatchInput> = {}) => swapBatch({
    location: seeded.location, checkout: seeded.checkout, index: seeded.index, files: [{ path, replace }], readBack: false,
    writer: SWAP_WRITER, format: "sha1", takeIn: deferring, ...overrides,
  });
  return { fixture, reference, seeded, laid, staged, file, swap, path, replace, record: record.result };
}

/** A take-in that lands what an aside copy holds over the record's current version, standing in for write-back's merge. */
export function landingCopies(store: ReturnType<typeof createReferenceFixture>["store"]): TakeInPort {
  return async (request) => {
    const location = join(request.checkout, request.copy ?? request.path);
    const text = await readFile(location, "utf8");
    const current = await store.read({ reference: request.entry.reference });
    if (current.status !== "ok") throw new Error("the fixture read was refused");
    const entry = recordWriteBackSent(request.entry, request.copy);
    const written = await store.write({
      action: "put", reference: request.entry.reference, content: parseStampedFile(text).content, expected: current.result.version,
      provenance: PROVENANCE,
    });
    if (written.status !== "ok") throw new Error("the landing write was refused");
    const stat = await readStat(location);
    if (stat === null) throw new Error("nothing to take in");
    const blob = gitBlobId(text, "sha1");
    return { answer: "taken-in", entry: recordLandedCopy(entry, request.copy, blob), read: { stat, blob } };
  };
}

/** What a prepared removal holds the file to. */
export interface PrepareRemovalOptions {
  readonly path?: string;
  /** The record's content as laid. */
  readonly content?: string;
  /** Whether the projection now lays another record at the path. */
  readonly relaid?: boolean;
  /** Whether the file's entry is withheld, as a rebuild with no usable index leaves one. */
  readonly withheld?: boolean;
  /** Something done to the file before the guard re-checks it, and the take-in the guard calls, over the fixture's store. */
  readonly guarded?: {
    readonly before?: (file: string) => Promise<void>;
    readonly takeIn?: (store: ReturnType<typeof createReferenceFixture>["store"]) => TakeInPort;
  };
}

/**
 * Prepare one file's removal: the guard's re-check with nothing staged, and a batch that removes the file where it
 * decided to; the caller removes the checkout the result names.
 * @param options - The file, its content, and what happens before the guard.
 * @returns The store, the seeded projection, the file's entry as laid, the guard's decision, and a batch.
 */
export async function prepareRemoval(options: PrepareRemovalOptions = {}) {
  const path = options.path ?? SWAP_PATH;
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document", "one");
  const content = options.content ?? "# Cohort: one\n\nBody.\n";
  const put = await fixture.store.write({ action: "put", reference, content, expected: null, provenance: PROVENANCE });
  if (put.status !== "ok") throw new Error("the fixture write was refused");
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path }] });
  const seededEntry = seeded.index.entries[path];
  if (seededEntry?.kind !== "record") throw new Error("expected the file's record entry");
  const laid = { ...seededEntry, withheld: options.withheld ?? false };
  const index = { ...seeded.index, entries: { ...seeded.index.entries, [path]: laid } };
  const file = join(seeded.checkout, path);
  await options.guarded?.before?.(file);
  const guarded = await guardReplacement({
    checkout: seeded.checkout, path, entry: laid, staged: null, reference: await readReference(seeded.checkout), format: "sha1",
    store: fixture.store, writer: SWAP_WRITER, takeIn: options.guarded?.takeIn?.(fixture.store) ?? deferring,
  });
  const remove = (overrides: Partial<SwapBatchInput> = {}) => {
    if (guarded.kind !== "replace") throw new Error(`expected the guard to remove the file, found ${guarded.cause}`);
    return swapBatch({
      location: seeded.location, checkout: seeded.checkout, index, readBack: false, writer: SWAP_WRITER, format: "sha1",
      files: [{ path, replace: guarded, relaid: options.relaid ?? false }], takeIn: deferring, ...overrides,
    });
  };
  return { fixture, reference, seeded, laid, file, path, guarded, remove };
}
