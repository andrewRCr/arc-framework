/** Durable routing provenance; each move writes a fresh write-once record. */
import { z } from "zod";

/** Semantic list coordinate; identity qualifies a personal inbox. */
export const RoutingListSchema = z.strictObject({ list: z.string().min(1), section: z.string().min(1).optional(), identity: z.string().min(1).optional() });
/** A move's time, source coordinate (null for an insert), and destination. */
export const RoutingReceiptSchema = z.strictObject({
  entryId: z.string().regex(/^[0-9a-f]{8}$/u),
  destination: RoutingListSchema,
  source: RoutingListSchema.nullable(),
  time: z.iso.datetime({ offset: true }),
});
/** Validated receipt content; its record key is independent of entryId. */
export type RoutingReceipt = z.infer<typeof RoutingReceiptSchema>;
/** Decode a stored receipt.
 * @param content - JSON bytes.
 * @returns Validated provenance or a diagnostic.
 */
export function parseRoutingReceipt(content: string): { success: true; data: RoutingReceipt } | { success: false; error: string } {
  try {
    const parsed = RoutingReceiptSchema.safeParse(JSON.parse(content));
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error.message };
  } catch { return { success: false, error: "Expected routing-receipt JSON." }; }
}
/** Serialize validated receipt fields.
 * @param receipt - Provenance of one move.
 * @returns Stable JSON content.
 */
export function writeRoutingReceipt(receipt: RoutingReceipt): string { return JSON.stringify(RoutingReceiptSchema.parse(receipt)); }
