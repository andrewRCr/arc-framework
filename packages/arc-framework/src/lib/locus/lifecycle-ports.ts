/** Lifecycle checkout claim operations bound to one operational context. */
import { resolve } from "node:path";
import { workUnitCheckoutClaim } from "../store/work-unit-claim.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { createWorktreeMarkerGeneration, decodeWorktreeMarkerOwnership, ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarkerGeneration, replaceWorktreeMarkerGeneration, resolveWorktreeMarkerPath } from "../git/worktree-marker.js";
import type { LocusPorts, HolderLookupRequest, HoldingCheckoutResult } from "../work-unit/locus-ports.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import { classifyUnboundMarker } from "./unbound-marker.js";

interface MarkerHolder { path: string; name: string; uid?: string; marker: WorktreeMarker }
const rerun = "Run again once Git lists all registered worktrees.";

/** Bind lifecycle's checkout claims to the selected checkout, executor and store. */
export function createLocusPorts(input: { cwd: string; exec: GitExec; store: Store }): LocusPorts {
  const exec: GitExec = (command, args, options) => input.exec(command, args, { cwd: input.cwd, ...options });
  async function holders(): Promise<MarkerHolder[]> {
    const topology = await scanRegisteredWorktrees(exec);
    if (!topology.ok) throw new Error(`${topology.message} ${rerun}`);
    if (topology.worktrees.length === 0) throw new Error(`The registered-worktree listing is incomplete. ${rerun}`);
    const holders: MarkerHolder[] = [];
    for (const checkout of topology.worktrees) {
      const holder = await readMarkerHolder(checkout.path);
      if (holder !== null) holders.push(holder);
    }
    return holders;
  }
  async function refusal(holder: MarkerHolder): Promise<string> {
    const lookup = await input.store.lookup({ kind: "claim", claim: workUnitCheckoutClaim(input.store, holder.name, holder.uid) });
    let state: string | null = null;
    let owner: string | null = null;
    if (lookup.status === "ok") {
      const record = await input.store.read({ reference: lookup.result.reference });
      if (record.status === "ok") {
        const parsed = ParsedMetaRecordSchema.safeParse(record.result.fields);
        if (parsed.success) { state = parsed.data.state; owner = parsed.data.owner; }
      }
    }
    const location = `Checkout ${holder.path} already holds work unit '${holder.name}' in ${resolveWorktreeMarkerPath(holder.path)}.`;
    const repair = state === "Integrating"
      ? "Work there to finish integration, then run teardown there."
      : state === "Planning" || state === "Active"
        ? `Work there, or as owner${owner === null ? "" : ` '${owner}'`} run arc pause ${holder.name} --reason <text>, then arc locus release there.`
        : `Work there, or free that checkout there with arc locus release.`;
    return `${location} ${repair}`;
  }
  return {
    checkMarkerExclusivity: async request => {
      try {
        const matches = await observeMatches(input.store, await holders(), request);
        requireSingleHolder(request, matches);
        const other = matches[0];
        if (other === undefined) return { kind: "clear" };
        return other.result.kind === "unbound"
          ? { kind: "refused", checkoutPath: other.holder.path, reason: other.result.reason, unbound: other.result }
          : { kind: "refused", checkoutPath: other.holder.path, reason: await refusal(other.holder) };
      }
      catch (error) { return { kind: "refused", reason: error instanceof Error ? error.message : String(error) }; }
    },
    findHoldingCheckout: async request => {
      const matches = await observeMatches(input.store, await holders(), request);
      requireSingleHolder(request, matches);
      const found = matches[0];
      return found === undefined ? { kind: "none" } : request.kind === "creation" ? { kind: "held", path: found.holder.path } : found.result;
    },
    writeAnchoredMarker: async (cwd, marker, options) => {
      await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
      return options?.expected === undefined ? createWorktreeMarkerGeneration(cwd, marker)
        : replaceWorktreeMarkerGeneration(cwd, options.expected, marker);
    },
  };
}
function matchingHolders(inventory: readonly MarkerHolder[], request: HolderLookupRequest, operational: boolean): MarkerHolder[] {
  return inventory.filter(holder => (request.kind === "owner" ? holder.uid === request.uid
    || operational && holder.uid === undefined && [request.names.current, ...request.names.former].includes(holder.name)
    : holder.uid === undefined && holder.name === request.slug)
    && (request.checkoutPath === undefined || resolve(holder.path) !== resolve(request.checkoutPath)));
}

function markerRepair(checkout: string, path: string, diagnostic: string): string {
  return `Cannot read checkout ${checkout}'s marker ${path}: ${diagnostic}. inspect it, then repair or remove its marker, or remove the checkout.`;
}

async function readMarkerHolder(checkout: string): Promise<MarkerHolder | null> {
  const path = resolveWorktreeMarkerPath(checkout);
  let marker;
  try { marker = await readWorktreeMarkerGeneration(checkout); }
  catch (error) { throw new Error(markerRepair(checkout, path, error instanceof Error ? error.message : String(error)), { cause: error }); }
  if (marker.kind === "absent") return null;
  if (marker.kind === "malformed") throw new Error(markerRepair(checkout, marker.path, marker.message));
  if (marker.marker.husk !== undefined) return null;
  const ownership = decodeWorktreeMarkerOwnership(marker.marker);
  if (ownership.kind !== "current") throw new Error(markerRepair(checkout, path, `Marker ownership is ${ownership.reason}`));
  return ownership.subject.kind === "work-unit" ? { path: checkout, name: ownership.subject.name, uid: ownership.subject.uid, marker: marker.marker } : null;
}

interface HolderObservation { holder: MarkerHolder; result: Exclude<HoldingCheckoutResult, { kind: "none" }> }
async function observeMatches(store: Store, inventory: readonly MarkerHolder[], request: HolderLookupRequest): Promise<HolderObservation[]> {
  const observations: HolderObservation[] = [];
  for (const holder of matchingHolders(inventory, request, store.capabilities.stateOffBranch)) {
    if (store.capabilities.stateOffBranch && holder.uid === undefined) {
      const classified = await classifyUnboundMarker({ store, cwd: holder.path, marker: holder.marker });
      if (classified.kind === "unreadable") throw new Error(classified.reason);
      observations.push({ holder, result: { kind: "unbound", path: holder.path, exits: classified.exits, reason: classified.reason } });
    } else observations.push({ holder, result: { kind: "held", path: holder.path } });
  }
  return observations;
}
function requireSingleHolder(request: HolderLookupRequest, matches: readonly HolderObservation[]): void {
  if (matches.length <= 1) return;
  const name = request.kind === "owner" ? request.names.current : request.slug;
  const details = matches.map(({ holder, result }) => `${holder.path} (${resolveWorktreeMarkerPath(holder.path)})${result.kind === "unbound" ? `: ${result.reason}` : ""}`);
  throw new Error(`Work unit '${name}' has multiple marker holders: ${details.join(", ")}. Inspect them, then repair or remove the stray marker, or remove its checkout.`);
}
