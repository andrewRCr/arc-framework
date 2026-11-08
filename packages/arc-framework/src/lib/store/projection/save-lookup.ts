/** Use an owner-unbound conflict inventory only to explain an unmapped resolution token. */
import { formatConflictToken, parseConflictToken } from "../../status/conflict-token.js";
import { familyOf } from "../catalog.js";
import { ConflictRecordSchema } from "../conflict.js";
import type { Store } from "../contract.js";
import type { RefusedMark } from "./index-schema.js";

/** Refuse missing projection authority without promoting a listed reference into a write target. */
export async function unmappedResolutionRefusal(store: Store, token: string): Promise<RefusedMark> {
  const parsed = parseConflictToken(token);
  if (parsed === null) return unknownResolution(token);
  const listing = await store.list({ family: familyOf(parsed.kind), kind: parsed.kind });
  if (listing.status === "refused") return { reason: listing.refusal.condition, remedy: listing.refusal.remedy };
  if (listing.result.status === "unreadable") return { reason: listing.result.condition, remedy: listing.result.remedy };
  if (listing.result.status === "absent") return unknownResolution(token);
  const matches = listing.result.records.filter(record => formatConflictToken(record.reference) === token);
  if (matches.length > 1) return { reason: `Ambiguous conflict token ${token}: ${matches.map(record => JSON.stringify(record.reference)).join("; ")}.`,
    remedy: { text: "Choose the projecting checkout for the intended owner UID, then retry there." } };
  if (listing.result.missed || listing.result.diagnostics.length > 0) return { reason: `The conflict inventory for ${token} is incomplete. ${listing.result.diagnostics.map(each => each.condition).join(" ")}`,
    remedy: { text: "Repair the reported inventory before retrying arc status --conflicts and arc save --resolve." } };
  const match = matches[0];
  if (match === undefined) return unknownResolution(token);
  const current = await store.read({ reference: match.reference });
  if (current.status === "refused") return current.refusal.code === "not-found" ? closedResolution(token)
    : { reason: current.refusal.condition, remedy: current.refusal.remedy };
  let value: unknown;
  try { value = JSON.parse(current.result.content); } catch { value = null; }
  const conflict = ConflictRecordSchema.safeParse(value);
  if (!conflict.success) return { reason: `Conflict ${token} is unreadable.`,
    remedy: { text: "Repair the conflict record, then retry arc status --conflicts." } };
  return { reason: `Conflict ${token} has no projected file in this checkout.`,
    remedy: { text: `Use a checkout projecting the subject owned by ${JSON.stringify(conflict.data.record.owner)}, then retry arc save --resolve ${token}.` } };
}

/** A closed conflict is a completed resolution, not a new authorization. */
export function closedResolution(token: string): RefusedMark {
  return { reason: `Conflict ${token} is already resolved.`,
    remedy: { text: "Use arc status --conflicts to choose an open conflict, or run arc save without --resolve." } };
}

function unknownResolution(token: string): RefusedMark {
  return { reason: `Unknown conflict token: ${token}.`, remedy: { text: "Use arc status --conflicts to find an open conflict token." } };
}
