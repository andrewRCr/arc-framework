/** Session materialize offers over oracle membership and machine-local checkout claims.
 * Before the flip the offer uses remote-only branch discovery. With off-branch
 * state it offers owned, released work independently of remote presence, leaving
 * paused work to its own slot and isolating each rejected holder lookup.
 */

import { readWorkUnit } from "../store/lifecycle-write.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "../store/contract.js";
import { storeInFlightLocationUnavailable, type StoreInFlightWorkUnit, type StoreInFlightEntry } from "../git/in-flight-store.js";
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";
import { selectWorkBranchLink } from "../store/lifecycle-branch.js";
import { createProjectIdentityReader } from "../store/project-identity.js";

import type { InFlightEntry } from "../git/in-flight-derivation.js";
import { RemoteFailureReasonSchema, SlugSchema } from "../kernel/index.js";

/** Runtime authority for one remotely materializable work unit. */
export const MaterializableWorkUnitSchema = z.strictObject({
  name: SlugSchema,
  branch: z.string().refine((value) => value.trim().length > 0, "branch must not be empty").optional(),
  actions: SessionActionsSchema.optional(),
});

/** One remote-only work unit that can be materialized onto this machine. */
export type MaterializableWorkUnit = z.infer<typeof MaterializableWorkUnitSchema>;

export interface FindMaterializableWorkUnitsOptions {
  /** Oracle-derived in-flight entries (work units and errands). */
  entries: readonly InFlightEntry[];
  /** Operator to filter to; `null` disables owner filtering. */
  identity: string | null;
  /** Advertised branches whose objects are still awaiting explicit discovery. */
  pendingBranchCount?: number;
}

/** Store membership is independent of remote presence; each holder lookup can fail separately. */
export interface FindStoreMaterializableWorkUnitsOptions extends Omit<FindMaterializableWorkUnitsOptions, "entries"> {
  entries: readonly StoreInFlightEntry[]; store: Store;
  findHoldingCheckout: (slug: string) => Promise<string | null>;
  markerlessCheckouts?: readonly { workUnit: string; checkoutPath: string }[];
  localRefsAvailable?: boolean;
  projectId?: () => Promise<string>;
}

/** Runtime authority for the materializable-work-unit advisory result. */
export const MaterializableWorkUnitsResultSchema = z.strictObject({
  candidates: z.array(MaterializableWorkUnitSchema),
  warnings: z.array(z.string()).optional(),
  actions: SessionActionsSchema.optional(),
});

/** Remote-only owned work units and optional upstream diagnostics. */
export type MaterializableWorkUnitsResult = z.infer<typeof MaterializableWorkUnitsResultSchema>;

/** Explicit action that can materialize pending advertised discovery objects. */
export const MaterializableDiscoveryRefreshRemedySchema = z.strictObject({
  text: z.string().min(1),
  argv: z.tuple([
    z.literal("arc"),
    z.literal("active"),
    z.literal("in-flight"),
    z.literal("--json"),
  ]),
});

const DiscoveryCommonFields = {
  candidates: z.array(MaterializableWorkUnitSchema),
  warnings: z.array(z.string()).optional(),
  actions: SessionActionsSchema.optional(),
};

/** Discovery-domain evidence contract installed into session status during composition cutover. */
export const MaterializableWorkUnitDiscoveryResultSchema = z.discriminatedUnion("remoteEvidence", [
  z.strictObject({
    ...DiscoveryCommonFields,
    remoteEvidence: z.literal("exact"),
    pendingBranchCount: z.literal(0),
    refreshRemedy: z.null(),
  }),
  z.strictObject({
    ...DiscoveryCommonFields,
    remoteEvidence: z.literal("pending-fetch"),
    pendingBranchCount: z.number().int().positive(),
    refreshRemedy: MaterializableDiscoveryRefreshRemedySchema,
  }),
  z.strictObject({
    ...DiscoveryCommonFields,
    candidates: z.array(MaterializableWorkUnitSchema).max(0),
    remoteEvidence: z.literal("unreachable"),
    pendingBranchCount: z.literal(0),
    refreshRemedy: z.null(),
    failureReason: RemoteFailureReasonSchema,
  }),
  z.strictObject({
    ...DiscoveryCommonFields,
    remoteEvidence: z.literal("not-applicable"),
    pendingBranchCount: z.literal(0),
    refreshRemedy: z.null(),
  }),
]);

/** Complete materializable-work-unit discovery domain result. */
export type MaterializableWorkUnitDiscoveryResult = z.infer<
  typeof MaterializableWorkUnitDiscoveryResultSchema
>;

/** Compose the exact explicit command offered for pending discovery. */
export function composeMaterializableDiscoveryRefreshRemedy(): z.infer<
  typeof MaterializableDiscoveryRefreshRemedySchema
> {
  return {
    text: "Refresh live in-flight discovery.",
    argv: ["arc", "active", "in-flight", "--json"],
  };
}

/**
 * Select the materializable work units from the oracle's in-flight entries.
 *
 * A WU qualifies when it is remote-only (no local branch or worktree) and owned
 * by the operator, or unattributed when an identity exists. Errands are never
 * WU candidates.
 *
 * @param options - The oracle entries and the operator identity to filter to.
 * @returns The operator's remote-only materializable work units.
 */
export function findMaterializableWorkUnits(options: FindStoreMaterializableWorkUnitsOptions): Promise<MaterializableWorkUnitsResult>;
export function findMaterializableWorkUnits(options: FindMaterializableWorkUnitsOptions): MaterializableWorkUnitsResult;
/** Select the legacy remote-only set or the store's released, unpaused work. */
export function findMaterializableWorkUnits(
  options: FindMaterializableWorkUnitsOptions | FindStoreMaterializableWorkUnitsOptions,
): MaterializableWorkUnitsResult | Promise<MaterializableWorkUnitsResult> {
  if ("store" in options) return options.store.capabilities.stateOffBranch
    ? findStoreMaterializableWorkUnits(options) : Promise.resolve(findLegacyMaterializableWorkUnits(options));
  return findLegacyMaterializableWorkUnits(options);
}

function findLegacyMaterializableWorkUnits(options: FindMaterializableWorkUnitsOptions | FindStoreMaterializableWorkUnitsOptions): MaterializableWorkUnitsResult {
  const { entries, identity } = options;
  const candidates: MaterializableWorkUnit[] = [];
  for (const entry of entries) {
    if (entry.kind !== "work-unit") continue;
    if (!entry.remoteOnly) continue;
    if (entry.scheduling === "parked") continue;
    if (entry.state === "Shipped") continue;
    if (entry.marks !== undefined && entry.marks.length > 0) continue;
    if (identity !== null && entry.owner !== undefined && entry.owner !== identity) continue;
    const name = SlugSchema.safeParse(entry.name);
    if (!name.success) continue;
    candidates.push({ name: name.data, branch: entry.branch,
      actions: [{ text: `arc materialize ${name.data}`, argv: ["arc", "materialize", name.data] }],
    });
  }
  return { candidates,
    ...((options.pendingBranchCount ?? 0) > 0
      ? { actions: [composeMaterializableDiscoveryRefreshRemedy()] } : {}),
  };
}

async function findStoreMaterializableWorkUnits(options: FindStoreMaterializableWorkUnitsOptions): Promise<MaterializableWorkUnitsResult> {
  const candidates: MaterializableWorkUnit[] = [];
  const warnings: string[] = [];
  for (const entry of options.entries) {
    if (entry.kind !== "work-unit" || !ownedUnpausedEntry(entry, options.identity)) continue;
    try {
      const candidate = await storeMaterializableCandidate(options, entry);
      if (candidate !== null) candidates.push(candidate);
    } catch (error) { warnings.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  candidates.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  return { candidates, ...(warnings.length === 0 ? {} : { warnings }) };
}
function ownedUnpausedEntry(entry: StoreInFlightWorkUnit, identity: string | null): boolean {
  return identity !== null && entry.owner === identity && entry.state !== "Shipped" && entry.scheduling !== "paused"
    && !storeInFlightLocationUnavailable(entry);
}
async function storeMaterializableCandidate(options: FindStoreMaterializableWorkUnitsOptions, entry: StoreInFlightWorkUnit): Promise<MaterializableWorkUnit | null> {
  const read = await readWorkUnit(options.store, entry.name);
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const record = read.result;
  if (record.conflicts.length > 0) throw new Error("Resolve the work unit's conflicting records before materializing it.");
  const fields = ParsedMetaRecordSchema.parse(record.fields);
  if (fields.pause !== null || fields.owner !== options.identity || record.placement?.kind !== "active" || !["Planning", "Active", "Integrating"].includes(fields.state ?? "")) return null;
  const name = SlugSchema.parse(record.reference.owner.name);
  if (await options.findHoldingCheckout(name) !== null) return null;
  if (options.localRefsAvailable === false) {
    const repository = await (options.projectId ?? createProjectIdentityReader(options.store))();
    const selection = selectWorkBranchLink(record, { repository });
    if (selection.kind === "ambiguous") throw new Error(selection.reason);
    if (selection.kind === "linked") return null;
  }
  const unmarked = options.markerlessCheckouts?.find(pair => pair.workUnit === name);
  const argv = ["arc", "materialize", name, ...(unmarked === undefined ? [] : ["--here"])];
  const text = unmarked === undefined ? argv.join(" ") : `Run ${argv.join(" ")} from ${unmarked.checkoutPath}.`;
  return { name, ...(entry.branch === undefined ? {} : { branch: entry.branch }),
    actions: [{ text, argv, ...(unmarked === undefined ? {} : { checkout: unmarked.checkoutPath }) }] };
}
