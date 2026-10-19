/** Version-bound atomic entry routing over the shared mover and receipt grammar. */
import { z } from "zod";
import { RemedySchema } from "../store/refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { RoutingListSchema } from "../store/kinds/routing-receipt.js";
import type { InboxContext, InboxRefusal } from "./types.js";
import { resolveEntryList, withProvenance } from "./lists.js";
import { acceptsEntries } from "./admission.js";
import { prepareRoute } from "./route-prepare.js";
/** Move form fields and insert form stdin bytes. */
export interface RouteEntryInput { entryId?: string; from?: string; expectedVersion?: string; to: string; section?: string; content?: string }
/** The registered route result never reports success for a refused batch. */
export const RouteResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("route"), state: z.enum(["routed", "already-home"]), entryId: z.string(), destination: RoutingListSchema, carried: z.enum(["replaced", "cited"]).optional() }),
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("route"), state: z.literal("refused"), code: z.string(), reason: z.string(), remedy: RemedySchema, foundVersion: z.string().optional(), provenance: z.unknown().optional() }),
]);
/** Versioned routing command result. */
export type RouteResult = z.infer<typeof RouteResultSchema>;
/** Move an observed entry or insert a new one from stdin.
 * @param input - Source/version or inserted entry bytes, and destination.
 * @param context - Store, identity, clock and random source.
 * @returns Atomic move result or refusal.
 */
export async function routeEntry(input: RouteEntryInput, context: InboxContext): Promise<RouteResult> {
  if (!context.store.capabilities.stateOffBranch) return routeRefusal({ code: "unsupported", condition: "arc route requires stateOffBranch capability.", remedy: { text: 'Use route-discovered-work, "Binding: carrying out outcomes", and its until-the-flip hold-and-route binding.' } });
  if (!SlugSchema.safeParse(context.identity).success) return routeRefusal({ code: "identity-missing", condition: "Routing requires a valid ARC identity.", remedy: { text: "Configure your ARC identity, then retry." } });
  const destination = await resolveEntryList(input.to, context);
  if (destination.status === "refused") return routeRefusal(destination.refusal);
  const admission = acceptsEntries(destination.result);
  if (admission.status === "refused") return routeRefusal(admission.refusal);
  const prepared = await prepareRoute(input, destination.result, context);
  if (prepared.status === "refused") return routeRefusal(prepared.refusal);
  if (prepared.result.kind === "already-home") return { schemaVersion: 1, mode: "route", state: "already-home", entryId: prepared.result.entryId, destination: prepared.result.destination };
  const { plan } = prepared.result;
  const result = await context.store.batch({ writes: plan.writes, provenance: { verb: "route", lifecycleAction: "route" } });
  return result.status === "refused" ? routeRefusal(withProvenance(result.refusal))
    : { schemaVersion: 1, mode: "route", state: "routed", entryId: plan.entryId, destination: plan.destination, ...(plan.carried === undefined ? {} : { carried: plan.carried }) };
}

function routeRefusal(refusal: InboxRefusal): RouteResult {
  return { schemaVersion: 1, mode: "route", state: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy,
    ...(refusal.foundVersion === undefined ? {} : { foundVersion: refusal.foundVersion }),
    ...(refusal.provenance === undefined ? {} : { provenance: refusal.provenance }) };
}
