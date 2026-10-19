/** Forwarding control records identify a departed project without retaining its state objects. */
import { z } from "zod";
import { CommitShaSchema } from "../links.js";
import type { StoreCommandRefusal } from "../commands.js";
import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";

/** The remote control ref is distinct from every manifested store ref. */
export const FORWARDING_REF = "refs/arc/project/moved";
/** The registry commit is data rather than a parent, so no state history stays reachable. */
export const ForwardingRecordSchema = z.strictObject({ projectId: z.uuid(), registryCommit: CommitShaSchema });
/** Exact project and move identity carried by the forwarding record. */
export type ForwardingRecord = z.infer<typeof ForwardingRecordSchema>;
type ForwardingRecordRead = { status: "ok"; result: ForwardingRecord | null }
  | { status: "refused"; refusal: StoreCommandRefusal & { code: "move-record-malformed" } };

/** Read one fetched forwarding tip, distinguishing absence from a malformed control record. */
export async function readForwardingRecord(context: RefBackendContext, tip: string | undefined,
  remote: string): Promise<ForwardingRecordRead> {
  if (tip === undefined) return { status: "ok", result: null };
  const query = `${tip}:moved.json`;
  const object = (await readBatchObjects(context, [query])).get(query);
  let parsed: ReturnType<typeof ForwardingRecordSchema.safeParse> | undefined;
  try { parsed = ForwardingRecordSchema.safeParse(object?.type === "blob"
    ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)) : null); }
  catch { /* Invalid bytes and JSON remain a malformed record, never an absent move. */ }
  if (!parsed?.success) return { status: "refused", refusal: { code: "move-record-malformed", class: "recoverable",
    condition: `The moved.json at ${FORWARDING_REF} on ${remote} is not a valid forwarding record.`,
    remedy: { text: `Repair or delete ${FORWARDING_REF} on ${remote}, then retry the operation.` } } };
  return { status: "ok", result: parsed.data };
}

/** Bring in the tracked pointer before following the move from this remote. */
export function forwardingFollowRemedy(remote: string): Remedy {
  return { text: `State moved from ${remote}. Bring in the code carrying the tracked pointer's change, then run arc store migrate to follow it.`,
    argv: ["arc", "store", "migrate"] };
}
