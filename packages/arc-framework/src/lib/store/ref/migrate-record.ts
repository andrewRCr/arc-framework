/** Leased, clone-local records that preserve a layout move's direction across its switch. */

import { z } from "zod";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { readGitDirectories } from "../../git/directories.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { bindRefRepository } from "./repository-context.js";
import { readSyncRefs } from "./sync-graph.js";
import { writeRefBlob, writeRefTree } from "./tree-write.js";

/** Only the code repository owns a move record, regardless of the active store layout. */
export const MOVE_REF = "refs/arc/tmp/migrate/move";
const LayoutSchema = z.enum(["default", "separate"]);
const SettingSchema = z.strictObject({ remote: z.string().min(1), role: z.enum(["push", "read", "off"]) });
const LayoutRecordSchema = z.strictObject({ kind: z.literal("layout"), source: LayoutSchema,
  destination: LayoutSchema, setting: SettingSchema.optional() }).refine((record) => record.source !== record.destination);
/** A layout record retains the final setting when it has not taken effect yet. */
export type LayoutMoveRecord = z.infer<typeof LayoutRecordSchema>;
/** A captured record and the exact value a replacement or removal must still find. */
export interface RecordedLayout { record: LayoutMoveRecord; tip: string }
/** A physical layout independent of remote-role terminology. */
export type StoreLayout = LayoutMoveRecord["source"];
/** One explicit role whose order is coupled to the physical switch. */
export type LayoutSetting = z.infer<typeof SettingSchema>;

/** Bind commands to the common code repository, where control refs always remain. */
export async function migrationCodeContext(context: RefBackendContext): Promise<RefBackendContext> {
  const { commonDir } = await readGitDirectories(context.checkoutRoot, context.fs);
  return bindRefRepository(context, commonDir, null);
}

/** Read only the recorded move, preserving absent and malformed as different outcomes. */
export async function readLayoutMoveRecord(code: RefBackendContext): Promise<StoreCommandResult<RecordedLayout | null>> {
  const tip = (await readSyncRefs(code, MOVE_REF)).get(MOVE_REF);
  if (!tip) return { status: "ok", result: null };
  const object = (await readBatchObjects(code, [`${tip}:move.json`])).get(`${tip}:move.json`);
  let parsed: ReturnType<typeof LayoutRecordSchema.safeParse> | undefined;
  try { parsed = LayoutRecordSchema.safeParse(object?.type === "blob" ? JSON.parse(new TextDecoder().decode(object.bytes)) : null); }
  catch { /* Invalid JSON is the same malformed record, never an absent move. */ }
  if (!parsed?.success) return { status: "refused", refusal: { code: "move-record-malformed", class: "recoverable",
    condition: `The move.json at ${MOVE_REF} is not a valid layout-move record.`,
    remedy: { text: `Repair the recorded move at ${MOVE_REF}, then retry arc store migrate.`, argv: ["arc", "store", "migrate"] } } };
  return { status: "ok", result: { record: parsed.data, tip } };
}

/** Write a root commit and install it only against the captured record value. */
export async function saveLayoutMoveRecord(code: RefBackendContext, record: LayoutMoveRecord, expected: string | null): Promise<RecordedLayout> {
  const oid = await writeRefBlob(code, canonicalize(record));
  const tree = await writeRefTree(code, [{ path: "move.json", mode: "100644", oid }]);
  const tip = (await code.exec("git", ["commit-tree", tree, "-m", "Record local store layout move"], { cwd: code.checkoutRoot })).stdout.trim();
  const result = await updateRefTransaction(code, [{ ref: MOVE_REF, next: tip, expected }], { cwd: code.checkoutRoot });
  if (result.status !== "committed") throw new Error("The recorded migration changed before its replacement");
  return { record, tip };
}

/** Remove only the exact record whose source cleanup has completed. */
export async function removeLayoutMoveRecord(code: RefBackendContext, recorded: RecordedLayout): Promise<void> {
  const result = await updateRefTransaction(code, [{ ref: MOVE_REF, delete: true, expected: recorded.tip }], { cwd: code.checkoutRoot });
  if (result.status !== "committed") throw new Error("The recorded migration changed before its removal");
}
