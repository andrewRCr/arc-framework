/** Bind proposed metadata to its actual stub receipt before interpreting companion names. */
import { withProjectionEntry } from "./index-memory.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark, MintedStubReceipt } from "./index-schema.js";
import type { BacklogOwnership } from "./container-ownership.js";
import type { StoreRecord } from "../read.js";
import type { TakeInRead } from "./take-in-port.js";
import { sameReference } from "../identity.js";
import { gateRead } from "./read-gate.js";
import { gitBlobId } from "./blob-id.js";
import { commitProjectionIndex } from "./index-file.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readProjectionProtection } from "./protection.js";

/** A minted owner and its published initial metadata obligation, or a retryable refusal. */
export type MintedProjectionOwner = { readonly kind: "minted"; readonly index: ProjectionIndex;
  readonly ownership: Extract<BacklogOwnership, { kind: "owned" }> } | MintRefusal;
type MintRefusal = { readonly kind: "refused"; readonly mark: RefusedMark; readonly index?: ProjectionIndex };
type BoundMetadata = { readonly kind: "bound"; readonly index: ProjectionIndex; readonly record: StoreRecord } | MintRefusal;

/** Publish the exact receipt before reading its basis, then bind the meta before its triggering companion. */
export async function mintProjectionMetadata(root: ProjectionRootState, index: ProjectionIndex,
  proposed: Extract<BacklogOwnership, { kind: "prospective" }>): Promise<MintedProjectionOwner> {
  if (root.mint === undefined) return refused("This prospective stub has not yet been created.",
    `Run arc stub ${proposed.params.name} --commitment ${proposed.params.commitment} --priority ${proposed.params.priority}`
      + (proposed.params.cls === undefined ? "" : ` --class ${proposed.params.cls}`)
      + (proposed.params.cohort === undefined ? "" : ` --cohort ${proposed.params.cohort}`) + ", then retry.");
  const observed = await readMetadata(root, proposed.metaPath);
  if (observed.kind === "refused") return observed;
  await root.context.checkpoint?.();
  const minted = await root.mint({ store: root.store, checkout: root.checkout, params: proposed.params });
  if (minted.kind === "refused") return minted;
  root.context.onWrite?.();
  const version = minted.receipt.version;
  if (version === undefined) throw new Error("A stub creation returned no version");
  const receipt: MintedStubReceipt = { reference: minted.receipt.reference, version };
  const pending = refused("The stub was created; its exact metadata basis is not yet bound.",
    "Restore the minted record read and its creation history, then retry adoption.");
  index = await commitProjectionIndex({ location: root.location, checkout: root.checkout, checkpoint: root.context.checkpoint,
    index: withProjectionEntry(index, proposed.metaPath, {
      kind: "ownerless", stat: observed.read.stat, refused: pending.mark, minted: receipt,
    }) });
  const bound = await bindMintedMetadata(root, index, proposed.metaPath, receipt, observed.read);
  return bound.kind === "refused" ? bound : { kind: "minted", index: bound.index,
    ownership: { kind: "owned", container: proposed.container, record: bound.record } };
}

/** Continue an accepted stub by exact receipt, without reminting or rebinding its public name. */
export async function resumeProjectionStub(root: ProjectionRootState, index: ProjectionIndex, path: string,
  receipt: MintedStubReceipt): Promise<BoundMetadata> {
  const observed = await readMetadata(root, path);
  return observed.kind === "refused" ? observed : bindMintedMetadata(root, index, path, receipt, observed.read);
}

async function readMetadata(root: ProjectionRootState, path: string): Promise<{ kind: "observed"; read: TakeInRead } | MintRefusal> {
  const absolute = join(root.checkout, path), gate = await gateRead({ path: absolute, markdown: false });
  if (gate.kind !== "read") return refused("The proposed metadata is not ready to read.",
    "Let the metadata save finish, or restore the proposed file, then retry adoption.");
  return { kind: "observed", read: { stat: gate.stat, blob: gitBlobId(await readFile(absolute), root.context.format) } };
}

async function bindMintedMetadata(root: ProjectionRootState, index: ProjectionIndex, path: string,
  receipt: MintedStubReceipt, read: TakeInRead): Promise<BoundMetadata> {
  const basis = await readMintedBasis(root, receipt);
  if (basis.kind === "refused") return { ...basis, index };
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, receipt.reference);
  if (denied !== null) return { kind: "refused", mark: denied, index };
  const entry: RecordEntry = { kind: "record", reference: basis.record.reference, stat: read.stat, written: read.blob,
    base: { blob: gitBlobId(basis.content, root.context.format), version: receipt.version }, markers: null, notices: [],
    unshown: basis.record.conflicts, protected: false, changed: true, pending: true, withheld: false, refused: null,
    persisted: null, inProgress: null, copies: [], adoption: { kind: "write-back", stub: true } };
  root.unsent.add(path);
  const bound = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    checkpoint: root.context.checkpoint, index: withProjectionEntry(index, path, entry) });
  return { kind: "bound", index: bound, record: basis.record };
}

async function readMintedBasis(root: ProjectionRootState, receipt: MintedStubReceipt): Promise<
  { kind: "basis"; record: StoreRecord; content: string } | MintRefusal
> {
  const current = await root.store.read({ reference: receipt.reference });
  if (current.status === "refused") return { kind: "refused", mark: markStoreRefusal(current.refusal, root.context.verb) };
  if (!sameReference(current.result.reference, receipt.reference)) return refused("The minted metadata no longer has its created role.",
    "Inspect the work item's current role, then reproject or repair the metadata before retrying adoption.");
  if (current.result.version === receipt.version) return { kind: "basis", record: current.result, content: current.result.content };
  const history = await (root.context.memo ?? createHistoryMemo(root.store)).read(receipt.reference);
  if (history.status === "refused") return { kind: "refused", mark: markStoreRefusal(history.refusal, root.context.verb) };
  const content = history.result.find(entry => entry.version === receipt.version)?.content;
  return content === undefined || content === null ? refused("The minted metadata version is not readable.",
    "Restore the stub's creation history, then retry adoption.") : { kind: "basis", record: current.result, content };
}

function refused(reason: string, remedy: string): MintRefusal {
  return { kind: "refused", mark: { reason, remedy: { text: remedy } } };
}
