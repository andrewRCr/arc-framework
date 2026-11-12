/** Legacy managed-reference replanning through personal Store records. */
import { basename } from "node:path";
import { withAdvisoryLock } from "../lib/advisory-lock.js";
import { getNotesLockPath } from "../lib/user-sync/notes-lock.js";
import { ArcError, SlugSchema } from "../lib/kernel/index.js";
import { resolveArcPath } from "../lib/layout/index.js";
import type { PersonalPaths } from "../lib/personal-paths.js";
import type { GitExec } from "../lib/git/exec.js";
import type { Store } from "../lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../lib/store/identity.js";
import type { StoreRecord } from "../lib/store/read.js";
import { mutatePersonalRecord } from "../lib/store/personal-mutation.js";
import { planUserReferenceReconcile, type PlanUserReferenceReconcileInput, type UserReferenceReconcileResult } from "../lib/user-reference-reconcile.js";

interface LegacyReferenceInput {
  cwd: string; identity: string; exec: GitExec; store: Store; paths: PersonalPaths; workUnit?: string; apply: boolean;
  transitions: PlanUserReferenceReconcileInput["transitions"];
}
/** Keep the read/replan lock while each backend write independently guards its actual version. */
export async function runLegacyStoreUserReferenceReconcile(input: LegacyReferenceInput): Promise<UserReferenceReconcileResult> {
  const inspected = planUserReferenceReconcile({ ...await readSurfaces(input), transitions: input.transitions });
  if (!input.apply || inspected.edits.length === 0) return { status: inspected.status, plan: inspected };
  const lock = await getNotesLockPath(input.exec, input.cwd, input.identity);
  let plan = inspected;
  const transaction = await mutatePersonalRecord({ store: input.store, reference: references(input.identity).inbox, verb: "user-reference-reconcile",
    withPreparationLock: operation => withAdvisoryLock(lock, operation),
    mutate: async record => {
      plan = planUserReferenceReconcile({ ...await readSurfaces(input, record), transitions: input.transitions });
      return { result: plan, ...(plan.edits[0] === undefined ? {} : { replacement: plan.edits[0].content }) };
    },
  });
  if (transaction.status === "refused") return { status: "refused", plan, refusal: transaction.refusal };
  const actual = transaction.result.result;
  return actual.edits.length === 0 ? { status: actual.status, plan: actual }
    : { status: "applied", plan: actual, writtenPaths: actual.edits.map(edit => edit.path) };
}
async function readSurfaces(input: LegacyReferenceInput, inbox?: StoreRecord | null): Promise<Omit<PlanUserReferenceReconcileInput, "transitions">> {
  const identity = SlugSchema.parse(input.identity), refs = references(identity);
  const [selectedInbox, memory, session] = await Promise.all([
    inbox === undefined ? readOptional(input.store, refs.inbox) : inbox,
    readOptional(input.store, refs.memory),
    input.workUnit === undefined ? null : readOptional(input.store, recordReferences["personal/session-context"](refs.owner, input.workUnit)),
  ]);
  const inboxFilename = basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } }));
  return { stateOffBranch: false,
    userInbox: { path: input.paths.identityGlobalDisplayPath(inboxFilename), content: selectedInbox?.content ?? "" },
    workingMemory: { path: input.paths.workingMemoryDisplayPath, content: memory?.content ?? "" },
    ...(session === null || input.workUnit === undefined ? {} : { sessionNotes: {
      path: input.paths.sessionNotesPath(SlugSchema.parse(input.workUnit)), content: session.content,
    } }),
  };
}
async function readOptional(store: Store, reference: RecordReference): Promise<StoreRecord | null> {
  const read = await store.read({ reference });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return null;
    throw new ArcError(`${read.refusal.condition} ${read.refusal.remedy.text}`, "user.reference-read-refused", { cause: read.refusal });
  }
  if (read.result.conflicts.length > 0) throw new ArcError("Resolve the personal record's conflicts before reconciling references.", "user.reference-conflicts");
  return read.result;
}
function references(identity: string) {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  return { owner, inbox: recordReferences["personal/inbox"](owner), memory: recordReferences["personal/working-memory"](owner) };
}
