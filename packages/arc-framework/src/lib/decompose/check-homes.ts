/** Existing-home resolution and lifecycle-based allocation rights for decomposition. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { companionArtifactName } from "../store/companion-name.js";

/** A canonical existing recipient with its exact metadata mutation basis. */
export interface DecomposeHome {
  destinationId: string;
  primary: StoreRecord;
  started: boolean;
  anotherOwner: boolean;
}

/** Check existing destinations and their allocation edit rights without resolving target locators. */
export async function checkDecomposeHomes(ctx: DecomposeContext, map: CutMap): Promise<DecomposeResult<readonly DecomposeHome[]>> {
  const homes: DecomposeHome[] = [];
  for (const [index, destination] of map.authoring.destinations.entries()) {
    if (destination.kind !== "existing-home") continue;
    const locus = `authoring.destinations.${index}.target`;
    if (destination.target.kind === "document") return { status: "refused", reason: "document-home", class: "recoverable",
      locus, remedy: { text: "Allocate this content to a work item or member instead of a document home, then retry." } };
    const home = await resolveHome(ctx, destination.destinationId, destination.target.slug, locus);
    if (home.status === "refused") return home;
    const rights = checkAllocationRights(map, home.result, destination.target.slug);
    if (rights !== undefined) return rights;
    homes.push(home.result);
  }
  return { status: "ok", result: homes };
}

function checkAllocationRights(map: CutMap, home: DecomposeHome, authoredSlug: string): DecomposeRefusal | undefined {
  if (!home.started) return undefined;
  const protectedArtifacts = [home.primary.reference.owner.name, authoredSlug].flatMap(slug =>
    [companionArtifactName(slug, "meta"), companionArtifactName(slug, "tasks")]);
  for (const [index, allocation] of map.authoring.sourceAllocations.entries()) {
    const target = allocation.disposition;
    if (target.kind !== "target" || target.destinationId !== home.destinationId) continue;
    if (!home.anotherOwner && !protectedArtifacts.includes(target.targetLocator.artifact)) continue;
    return { status: "refused", reason: "unwritable-target", class: "recoverable",
      locus: `authoring.sourceAllocations.${index}.disposition.targetLocator`,
      message: `${JSON.stringify(target.targetLocator.artifact)} is not writable by this operator on the started home ${home.primary.reference.owner.name}.`,
      remedy: { text: home.anotherOwner
        ? `Route this content as an inbound entry to ${home.primary.reference.owner.name} for its owner to integrate, or choose another destination.`
        : "Target the home's draft, spec, or notes instead of its meta or task list, then retry." } };
  }
  return undefined;
}

async function resolveHome(ctx: DecomposeContext, destinationId: string, slug: string, locus: string): Promise<DecomposeResult<DecomposeHome>> {
  const store = ctx.executor.store;
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found"
    ? invalidHome(slug, locus, "does not resolve to a work unit") : decomposeStoreRefusal(lookup.refusal);
  if (lookup.result.reference.kind !== "work-item/meta") return invalidHome(slug, locus, "resolves to an Errand");
  const primary = await store.read({ reference: lookup.result.reference });
  if (primary.status === "refused") return primary.refusal.code === "not-found"
    ? invalidHome(slug, locus, "has no primary record") : decomposeStoreRefusal(primary.refusal);
  if (primary.result.placement?.kind === "completed") return invalidHome(slug, locus, "is completed");
  const fields = readLifecycleMetaFields(primary.result);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  return { status: "ok", result: { destinationId, primary: primary.result, started: primary.result.placement?.kind === "active",
    anotherOwner: fields.result.owner !== ctx.identity } };
}

function invalidHome(slug: string, locus: string, condition: string): DecomposeRefusal {
  return { status: "refused", reason: "existing-home", class: "recoverable", locus,
    message: `${JSON.stringify(slug)} ${condition}.`, remedy: { text: "Choose another destination that resolves to an open work unit, then retry." } };
}
