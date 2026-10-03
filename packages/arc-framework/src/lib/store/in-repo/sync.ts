/** Publish the interim personal notes and transient identity refs independently. */
import { ArcError } from "../../kernel/errors.js";
import { isAbsolute, join } from "node:path";
import { SyncResultSchema, type SyncResult } from "../sync.js";
import type { InRepoContext } from "./context.js";
import { notesIO } from "./sync-io.js";
import { notesPublish, transientPublish } from "./sync-outcomes.js";

/** Sync identity-scoped substrates without pushing the checkout's branch.
 * @param context - Explicit backend dependencies.
 * @returns States and one outcome for each independent publish.
 */
export async function syncInRepo(context: InRepoContext): Promise<SyncResult> {
  const [identity, remote] = await Promise.all([context.ports.identity(), context.ports.remote()]);
  const states: SyncResult["states"] = remote === null ? [{ status: "no-remote" }] : [];
  if (identity === null) {
    states.push({ status: "no-identity", families: ["personal", "work-item", "claims"], remedy: { text: "Set arc.identity, then sync again." } });
    return { states, publishes: [] };
  }
  if (remote === null) return { states, publishes: [] };
  const [{ runUserSave }, { UserSaveError, UserSaveVerificationError }, { reconcileNotesPush }, { reconcileErrandPush }] = await Promise.all([
    import("../../../commands/user/save-load.js"), import("../../../commands/user/types.js"),
    import("../../../commands/user/push-fetch.js"), import("../../errand/merge.js"),
  ]);
  const io = notesIO(context, identity);
  const started = context.ports.clock().getTime();
  let noEligibleFiles = false;
  try { await runUserSave({ cwd: context.ports.checkoutRoot, io, identity, withNotesLock: context.ports.locks.notes }); }
  catch (error) {
    if (error instanceof UserSaveError && !(error instanceof UserSaveVerificationError) && error.reason === "no-eligible-files") noEligibleFiles = true;
    else throw new ArcError("Personal notes could not be saved", "store.sync-failed", { cause: error });
  }
  const notes = noEligibleFiles ? { kind: "no-local-notes" as const } : await reconcileNotesPush({ cwd: context.ports.checkoutRoot, io, identity,
    access: async (path) => { await context.ports.fs.lstat(isAbsolute(path) ? path : join(context.ports.checkoutRoot, path)); }, withNotesLock: context.ports.locks.notes });
  const personal = notesPublish(notes, elapsed(context, started));
  const transientStarted = context.ports.clock().getTime();
  const transient = transientPublish(await reconcileErrandPush({ exec: io.exec, execInput: context.ports.execInput, identity }), elapsed(context, transientStarted));
  return SyncResultSchema.parse({ states, publishes: [personal, transient] });
}
function elapsed(context: InRepoContext, started: number): number { return Math.max(0, context.ports.clock().getTime() - started); }
