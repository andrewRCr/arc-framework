/** Read records and families from immutable manifest tips, confined to this identity. */
import { readRefRepository } from "./repository.js";
import { checkRefKey } from "./path-admission.js";
import type { StateVersion } from "../identity.js";
import type { ReadInput, ListInput, StoreRecord, ListingOutcome } from "../read.js";
import { HistoryRefSchema, type StoreResult } from "../refusal.js";
import type { StoreView } from "../write-check.js";
import type { RefBackendContext } from "./context.js";
import { readRefManifest } from "./manifest-read.js";
import { captureRefViewState } from "./view-state.js";
import { capturedRefView } from "./write-views.js";
import { matchesFamilyRef, rootFamily } from "./codec.js";
import { refListingRefusal } from "./read.js";
import { isArchiveRef } from "./archive-read.js";

/** Resolve a saved record without consulting today's state ref tips. */
export async function readSnapshotRecord(context: RefBackendContext, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  if (!input.asOf) throw new Error("A snapshot read requires a state version");
  const invalid = checkRefKey(input.reference, context.registry, false);
  if (invalid) return { status: "refused", refusal: invalid };
  context = await readRefRepository(context);
  const loaded = await snapshotView(context, input.asOf, { family: context.registry[input.reference.kind].family, owner: input.reference.owner });
  return loaded.status === "refused" ? loaded : loaded.result.read(input);
}

/** Retain the requested manifest as the listing's token without writing a new one. */
export async function listSnapshotRecords(context: RefBackendContext, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  if (!input.asOf) throw new Error("A snapshot listing requires a state version");
  const unsupported = refListingRefusal(input);
  if (unsupported) return { status: "refused", refusal: unsupported };
  context = await readRefRepository(context);
  const loaded = await snapshotView(context, input.asOf, input);
  if (loaded.status === "refused") return loaded;
  const listing = await loaded.result.list(input);
  return listing.status === "refused" || listing.result.status === "unreadable" ? listing
    : { status: "ok", result: { ...listing.result, asOf: input.asOf } };
}

async function snapshotView(context: RefBackendContext, version: StateVersion, input: ListInput): Promise<StoreResult<StoreView>> {
  const manifest = await readRefManifest(context, version);
  if (!manifest) return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", stateVersion: version, historyRefs: [],
    condition: "The saved manifest is not available in this clone.", remedy: { text: "Rebuild the saved state from the current store and retry with its new state version." } } };
  const tips = selectSnapshotTips(manifest, input, await context.identity());
  const state = await captureRefViewState(context, tips);
  const unavailable = [...state.refs].filter(([, group]) => group.entries === undefined).map(([ref]) => ref);
  if (unavailable.length) return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", stateVersion: version,
    historyRefs: unavailable.filter((ref) => /^refs\/arc\/(?:work|cohort)\//u.test(ref)).map((ref) => HistoryRefSchema.parse(ref.replace("refs/arc/", "refs/arc/history/"))),
    condition: `Saved state tips or their root trees are unavailable: ${unavailable.join(", ")}`,
    remedy: { text: "Pull the named history refs or restore the missing state objects, then retry this saved-state read." } } };
  return { status: "ok", result: capturedRefView(context, () => Promise.resolve(state)) };
}

function selectSnapshotTips(manifest: ReadonlyMap<string, string>, input: ListInput, identity: string | null): Map<string, string> {
  const root = rootFamily(input.family);
  const liveOwner = manifestHasLiveOwner(manifest, input);
  return new Map([...manifest].filter(([ref]) => {
    if (ref.startsWith("refs/arc/user/")) {
      if (ref.split("/")[3] !== identity || input.owner && input.owner.name !== identity) return false;
    }
    if (input.family === "lineage" && input.owner?.type === "work-item" && !input.owner.uid && matchesFamilyRef(ref, "work-item")) return true;
    if (ref === "refs/arc/project/registry" && ["project-inbox", "project-registry"].includes(root)) return true;
    if (["work-item", "cohort"].includes(root) && isArchiveRef(ref)) return !liveOwner;
    if (!matchesFamilyRef(ref, input.family)) return false;
    return !input.owner || !("uid" in input.owner) || !input.owner.uid || !["work-item", "cohort"].includes(root) || ref.endsWith(`/${input.owner.uid}`);
  }));
}

function manifestHasLiveOwner(manifest: ReadonlyMap<string, string>, input: ListInput): boolean {
  const owner = input.owner;
  if (!owner || !("uid" in owner) || !owner.uid || !["work-item", "cohort"].includes(owner.type)) return false;
  return manifest.has(`refs/arc/${owner.type === "work-item" ? "work" : "cohort"}/${owner.uid}`);
}
