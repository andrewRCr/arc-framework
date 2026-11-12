/** Native cut-map admission over one atomic source, identity, and inventory snapshot. */
import type { WriteCheckInput, BrokenRule } from "../../write-check.js";
import type { EntryListConfig } from "../../concurrency/entries.js";
import type { StoreRecord } from "../../read.js";
import type { CutMap } from "../../../decompose/cut-map-schema.js";
import type { DecomposeBatchAction } from "../../../decompose/provenance.js";
import type { DecomposeReadStore } from "../../../decompose/read-store.js";
import type { DecomposeTerminalMember } from "../../../decompose/acquire-terminal.js";
import type { DecomposeRefusal } from "../../../decompose/refusal.js";
import { decodeCutMapContent } from "./parser.js";
import { cutMapBindingFailure, checkCutMapObservedGroup, checkCutMapRemovedGroups } from "./observed-groups.js";
import { decomposeReadCache } from "../../../decompose/read-cache.js";
import { acquireDecomposeMembers } from "../../../decompose/member-identity.js";
import { acquireDecomposeOriginRecords } from "../../../decompose/acquire-origin.js";
import { deriveDecomposeMachine } from "../../../decompose/machine-facts.js";
import { checkDecomposeInbound } from "../../../decompose/start-guards.js";
import { checkDecomposeTerminalOrigin } from "../../../decompose/check-terminal-origin.js";
import { checkDecomposeSourceBinding } from "../../../decompose/source-binding.js";
import { acquireDecomposeTerminalCohorts } from "../../../decompose/acquire-terminal-targets.js";
import { checkDecomposeMemberPlacement } from "../../../decompose/check-member-placement.js";
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { checkStoredCutBirths } from "./birth-check.js";
import type { StoredCutMap } from "./schema.js";

interface CutAdmission {
  input: WriteCheckInput;
  store: DecomposeReadStore;
  action: DecomposeBatchAction;
  map: CutMap;
  storedMap?: StoreRecord;
  members: readonly DecomposeTerminalMember[];
  grammar?: EntryListConfig;
}

/** Check every decompose map mutation with trusted action and before-state operation evidence. */
export async function checkCutMapBinding(input: WriteCheckInput, grammar?: EntryListConfig): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "decompose") return [];
  const action = cutAction(input.writer.lifecycleAction);
  if (action === undefined || !validMutationShape(input, action)) return invalid("The cut-map mutation lacks its matching lifecycle action.");
  const decoded = decodeCutMapContent(input.next?.content ?? input.prior?.content ?? "");
  if (!decoded.success) return invalid(decoded.error);
  const map = decoded.data.map;
  if (input.reference.owner.type !== "work-item" || input.reference.owner.uid !== map.machine.origin.uid) {
    return invalid("The cut map does not belong to its selected origin generation.");
  }
  const store = decomposeReadCache(input.before);
  const stored = await store.read({ reference: input.reference });
  if (stored.status === "refused" && (action !== "additive" || stored.refusal.code !== "not-found")) {
    return cutMapBindingFailure(stored.refusal.condition, stored.refusal.remedy);
  }
  const selected = await priorMembers(store, action, stored.status === "ok" ? stored.result : undefined);
  if (selected.status === "refused") return domainFailure(selected);
  const members = selected.result;
  const state: CutAdmission = { input, store, action, map, members,
    ...(stored.status === "ok" ? { storedMap: stored.result } : {}), ...(grammar === undefined ? {} : { grammar }) };
  return checkPreparedCut(state, decoded.data);
}

async function checkPreparedCut(state: CutAdmission, next: StoredCutMap): Promise<readonly BrokenRule[]> {
  const { input, store, action, members, storedMap } = state;
  if (action !== "discard") {
    const bound = await checkSourceBinding(state);
    if (bound.length > 0) return bound;
  }
  if (input.next !== undefined) {
    const prior = storedMap === undefined ? undefined : decodeCutMapContent(storedMap.content);
    if (prior?.success === false) return invalid(prior.error);
    const births = await checkStoredCutBirths(input, store, next, prior?.data);
    if (births.length > 0) return births;
  }
  return action === "discard" || action === "revise" ? checkCutMapRemovedGroups(input, store, members) : [];
}

async function priorMembers(store: DecomposeReadStore, action: DecomposeBatchAction,
  stored: StoreRecord | undefined): Promise<import("../../../decompose/refusal.js").DecomposeResult<readonly DecomposeTerminalMember[]>> {
  if (action === "additive" || stored === undefined) return { status: "ok", result: [] };
  const prior = decodeCutMapContent(stored.content);
  if (!prior.success) return { status: "refused", reason: "invalid-structure", class: "recoverable", message: prior.error,
    remedy: { text: "Restore a valid stored cut map, then prepare again." } };
  return acquireDecomposeMembers(store, prior.data, stored);
}

async function checkSourceBinding(state: CutAdmission): Promise<readonly BrokenRule[]> {
  const { input, store, map, action, members, storedMap } = state;
  const excluded = new Set(members.flatMap(member => {
    const owner = member.primary?.reference.owner;
    return owner?.type === "work-item" && owner.uid !== undefined ? [owner.uid] : [];
  }));
  const acquired = await acquireDecomposeOriginRecords(store, input.reference.owner.name, excluded);
  if (acquired.status === "refused") return domainFailure(acquired);
  const group = await checkCutMapObservedGroup(input, store, acquired.result.primary.reference.owner);
  if (group.length > 0) return group;
  const context = { ...(state.grammar === undefined ? {} : { inboundGrammar: state.grammar }) };
  const held = checkDecomposeInbound(context, acquired.result);
  if (held !== undefined) return domainFailure(held);
  if (action !== "terminal") {
    const fresh = deriveDecomposeMachine(acquired.result);
    if (fresh.status === "refused") return domainFailure(fresh);
    return canonicalize(fresh.result) === canonicalize(map.machine) ? []
      : invalid("The origin's source or relevant dependency identities changed; rebind the map and prepare again.");
  }
  if (storedMap === undefined) return invalid("The terminal cut has no current stored map.");
  const source = { map, acquired: { ...acquired.result, storedMap } };
  const origin = checkDecomposeTerminalOrigin(source);
  if (origin.status === "refused") return domainFailure(origin);
  const decoded = decodeCutMapContent(storedMap.content);
  if (!decoded.success) return invalid(decoded.error);
  const cohorts = await acquireDecomposeTerminalCohorts(store, map, decoded.data, storedMap);
  if (cohorts.status === "refused") return domainFailure(cohorts);
  const placement = checkDecomposeMemberPlacement({ ...source, members, cohorts: cohorts.result });
  if (placement !== undefined) return domainFailure(placement);
  const bound = checkDecomposeSourceBinding(context, source);
  return bound.status === "refused" ? domainFailure(bound) : [];
}

function cutAction(action: string | undefined): DecomposeBatchAction | undefined {
  return action === "additive" || action === "terminal" || action === "revise" || action === "discard" ? action : undefined;
}

function validMutationShape(input: WriteCheckInput, action: DecomposeBatchAction): boolean {
  if (action === "additive") return input.prior === undefined && input.next !== undefined;
  if (action === "revise") return input.prior !== undefined && input.next !== undefined;
  return input.prior !== undefined && input.next === undefined;
}

function invalid(condition: string): readonly BrokenRule[] {
  return cutMapBindingFailure(condition, {
    text: "Acquire the current cut and rebind its source and dependencies when needed; prepare a fresh preview and obtain approval before applying a removing batch.",
  });
}

function domainFailure(refusal: DecomposeRefusal): readonly BrokenRule[] {
  return cutMapBindingFailure(refusal.message ?? refusal.remedy.text, refusal.remedy);
}
