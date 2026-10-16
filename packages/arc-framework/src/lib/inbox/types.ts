/** Public command results and injected runtime for store-backed entry lists. */
import { z } from "zod";
import type { StoreSyncPort } from "../store/operational-sync.js";
import type { Store } from "../store/contract.js";
import type { ListingOutcome } from "../store/read.js";
import type { StoreRefusal } from "../store/refusal.js";
import { RoutingListSchema } from "../store/kinds/routing-receipt.js";

/** Shared runtime; time and identity belong to the caller's store binding. */
export interface InboxContext {
  store: Store;
  sync?: StoreSyncPort;
  identity: string;
  now: () => Date;
  random?: () => number;
  key?: () => string;
}
/** One listed entry, retaining the exact entry and record mutation bases. */
export const InboxRowSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{8}$/u), version: z.string().regex(/^v1:[0-9a-f]{16}$/u),
  title: z.string(), section: z.string(), raw: z.string(), fields: z.record(z.string(), z.string()),
  sourceVersion: z.string().min(1), held: z.boolean(),
  survivor: z.strictObject({ home: RoutingListSchema }).optional(),
});
/** A row's version and raw text are exactly what observed-remove merging compares. */
export type InboxRow = z.infer<typeof InboxRowSchema>;
/** A named refusal preserves underlying store refusal evidence where available. */
export interface InboxRefusal { code: string; condition: string; remedy: { text: string }; foundVersion?: string; provenance?: StoreRefusal | ListingOutcome }
/** Service outcomes retain refusal provenance instead of presenting incomplete data as empty. */
export type InboxOutcome<T> = { status: "ok"; result: T } | { status: "refused"; refusal: InboxRefusal };
/** One public listing, including the capture gates' clear/named/refused states. */
export const InboxResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("inbox"), state: z.enum(["listed", "clear", "named"]),
    list: z.string(), target: z.string().optional(), entries: z.array(InboxRowSchema),
    pending: z.strictObject({ count: z.number().int().nonnegative(), oldestDate: z.string().nullable(), oldestAgeDays: z.number().nonnegative().nullable() }).optional(),
    retriage: z.strictObject({ text: z.string() }).optional(),
  }),
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("inbox"), state: z.literal("refused"), list: z.string(),
    code: z.string(), reason: z.string(), remedy: z.strictObject({ text: z.string() }), provenance: z.unknown().optional(),
  }),
]);
/** The complete registered listing result. */
export type InboxResult = z.infer<typeof InboxResultSchema>;
