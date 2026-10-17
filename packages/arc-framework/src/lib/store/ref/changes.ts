/** Landed record mutations between exact saved manifests, grouped across physical refs. */
import type { ChangesInput, HistoryEntry } from "../contract.js";
import type { StoreResult } from "../refusal.js";
import { readRefManifest } from "./manifest-read.js";
import type { RefBackendContext } from "./context.js";
import { isLifecycleRef } from "./changes-ends.js";
import { lifecycleChangeWindows } from "./changes-lifecycle.js";
import { isArchiveRef } from "./archive-read.js";
import { createChangeWindowReader, type RefChangeWindow } from "./changes-graph.js";
import { changeWindowReferences, changeWindowEvents, groupChangeBatches, type RefChangeEvent } from "./changes-records.js";
import type { OwnerIdentity } from "../identity.js";
import { checkRefKey } from "./path-admission.js";
import { resolveChangeRestrictions, needsLifecycleWindows, matchesChangeRestriction, restrictedChangeWindow } from "./changes-scope.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { readBatchObjects } from "./batch-read.js";
import type { ChangeWindowReader } from "./changes-graph.js";

/** Compare immutable commit windows and retain each record's post-batch state once. */
export async function changesRefRecords(context: RefBackendContext, input: ChangesInput): Promise<StoreResult<HistoryEntry[]>> {
  for (const reference of input.references ?? []) {
    const invalid = checkRefKey(reference, context.registry, false);
    if (invalid) return { status: "refused", refusal: invalid };
  }
  const identity = await context.identity();
  const personal = input.references?.find(({ owner }) => owner.type === "person");
  if (identity === null && personal) return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference: personal,
    condition: "No arc.identity is configured for identity history.", remedy: { text: "Configure arc.identity, then retry the comparison." } } };
  const [before, after] = await Promise.all([readRefManifest(context, input.from), readRefManifest(context, input.to)]);
  if (!before || !after) return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
    stateVersion: !before ? input.from : input.to, historyRefs: [], condition: "A compared manifest is not available in this clone.",
    remedy: { text: "Rebuild the saved comparison from current state, then retry with available state versions." } } };
  if (input.references?.length === 0) return { status: "ok", result: [] };
  const interval = { input, before, after };
  const restrictions = await resolveChangeRestrictions(context, interval);
  if (restrictions.status === "refused") return restrictions;
  input = { ...input, references: restrictions.result };
  const windows: RefChangeWindow[] = [...after].filter(([ref, upper]) => !isArchiveRef(ref) && !isLifecycleRef(ref) && before.get(ref) !== upper
    && (identity !== null || !ref.startsWith("refs/arc/user/"))).map(([ref, upper]) => ({ ref, upper, lower: before.get(ref), version: input.to }));
  const readWindow = createChangeWindowReader(context);
  if (needsLifecycleWindows(context, input.references)) {
    const lifecycle = await lifecycleChangeWindows(context, { ...interval, input }, readWindow);
    if (lifecycle.status === "refused") return lifecycle;
    windows.push(...lifecycle.result);
  }
  windows.sort((left, right) => left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0);
  const project = windows.some(({ ref }) => ref.startsWith("refs/arc/project/"))
    ? projectOwnerFromObjects(after, await readBatchObjects(context, projectIdentityQueries(after))) : { status: "ok" as const, result: null };
  if (project.status === "refused") return project;
  return collectChangeEvents(context, input, windows, readWindow, project.result ?? undefined);
}

async function collectChangeEvents(context: RefBackendContext, input: ChangesInput, windows: readonly RefChangeWindow[], readWindow: ChangeWindowReader,
  projectOwner?: OwnerIdentity): Promise<StoreResult<HistoryEntry[]>> {
  const events: RefChangeEvent[] = [];
  for (const planned of windows) {
    const window = await restrictedChangeWindow(context, planned, input.references);
    if (!window) continue;
    const captured = await readWindow(window);
    if (captured.status === "refused") return captured;
    const references = changeWindowReferences(context, captured.result, projectOwner);
    if (references.status === "refused") return references;
    const selected = input.references ? references.result.filter((reference) => input.references?.some((requested) => matchesChangeRestriction(requested, reference))) : references.result;
    const changes = changeWindowEvents(context, captured.result, selected);
    if (changes.status === "refused") return changes;
    events.push(...changes.result);
  }
  return { status: "ok", result: groupChangeBatches(events) };
}
