/** Leased, clone-local records that preserve migration direction and transport targets across a switch. */

import { ForwardingRecordSchema } from "./forwarding-record.js";
import { CommitShaSchema } from "../links.js";
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
const RemoteSchema = z.strictObject({ name: z.string().min(1), fetchUrl: z.string().min(1), pushUrl: z.string().min(1), repository: z.enum(["code", "backing"]) });
const RemoteRecordSchema = z.strictObject({ kind: z.literal("remote"), source: RemoteSchema, destination: RemoteSchema,
  registryCommit: CommitShaSchema });
const FollowRecordSchema = z.strictObject({ kind: z.literal("follow"), source: RemoteSchema, destination: RemoteSchema,
  answer: SettingSchema.shape.role, forwarding: ForwardingRecordSchema, forwardingTip: CommitShaSchema,
  sourceLayout: LayoutSchema, destinationLayout: LayoutSchema });
const LeaveSourceRecordSchema = z.strictObject({ kind: z.literal("leave-source"), source: RemoteSchema, destination: RemoteSchema,
  sourceLayout: LayoutSchema, destinationLayout: LayoutSchema });
const MoveRecordSchema = z.union([LayoutRecordSchema, RemoteRecordSchema, FollowRecordSchema, LeaveSourceRecordSchema]);
/** A source departure retains its targets and layout direction after its last-view copy lands. */
export type LeaveSourceMoveRecord = z.infer<typeof LeaveSourceRecordSchema>;
/** The source is never contacted while this recorded switch completes. */
export interface RecordedLeaveSource { record: LeaveSourceMoveRecord; tip: string }
/** A follow retains the exact judged control and the person's publication answer. */
export type FollowMoveRecord = z.infer<typeof FollowRecordSchema>;
/** The follow's compare-and-swap basis stays in the code repository across layout changes. */
export interface RecordedFollow { record: FollowMoveRecord; tip: string }
/** Captured transport targets remain usable after the designation repoints a remote. */
export type MoveRemote = z.infer<typeof RemoteSchema>;
/** A remote record binds restart to the move commit actually copied to its destination. */
export type RemoteMoveRecord = z.infer<typeof RemoteRecordSchema>;
/** One restartable layout or remote migration. */
export type MoveRecord = z.infer<typeof MoveRecordSchema>;
/** A captured remote record and its compare-and-swap basis. */
export interface RecordedRemote { record: RemoteMoveRecord; tip: string }
/** The complete record read preserves its kind for dispatch. */
export interface RecordedMove { record: MoveRecord; tip: string }
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
export async function readMoveRecord(code: RefBackendContext): Promise<StoreCommandResult<RecordedMove | null>> {
  const tip = (await readSyncRefs(code, MOVE_REF)).get(MOVE_REF);
  if (!tip) return { status: "ok", result: null };
  const object = (await readBatchObjects(code, [`${tip}:move.json`])).get(`${tip}:move.json`);
  let parsed: ReturnType<typeof MoveRecordSchema.safeParse> | undefined;
  try { parsed = MoveRecordSchema.safeParse(object?.type === "blob" ? JSON.parse(new TextDecoder().decode(object.bytes)) : null); }
  catch { /* Invalid JSON is the same malformed record, never an absent move. */ }
  if (!parsed?.success) return { status: "refused", refusal: { code: "move-record-malformed", class: "recoverable",
    condition: `The move.json at ${MOVE_REF} is not a valid migration record.`,
    remedy: { text: `Repair the recorded move at ${MOVE_REF}, then retry arc store migrate.`, argv: ["arc", "store", "migrate"] } } };
  return { status: "ok", result: { record: parsed.data, tip } };
}

/** Write a root commit and install it only against the captured record value. */
export async function saveMoveRecord<T extends MoveRecord>(code: RefBackendContext, record: T, expected: string | null): Promise<{ record: T; tip: string }> {
  const oid = await writeRefBlob(code, canonicalize(record));
  const tree = await writeRefTree(code, [{ path: "move.json", mode: "100644", oid }]);
  const tip = (await code.exec("git", ["commit-tree", tree, "-m", "Record local store move"], { cwd: code.checkoutRoot })).stdout.trim();
  const result = await updateRefTransaction(code, [{ ref: MOVE_REF, next: tip, expected }], { cwd: code.checkoutRoot });
  if (result.status !== "committed") throw new Error("The recorded migration changed before its replacement");
  return { record, tip };
}

/** Remove only the exact record whose source cleanup has completed. */
export async function removeMoveRecord(code: RefBackendContext, recorded: RecordedMove): Promise<void> {
  const result = await updateRefTransaction(code, [{ ref: MOVE_REF, delete: true, expected: recorded.tip }], { cwd: code.checkoutRoot });
  if (result.status !== "committed") throw new Error("The recorded migration changed before its removal");
}
