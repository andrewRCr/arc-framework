/** Before reading a branch, prove it belongs to the Errand whose checkout is absent locally. */
import { SlugSchema } from "../kernel/index.js";
import { sameReference, type RecordReference } from "../store/identity.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import type { StoreRefusal } from "../store/refusal.js";
import type { CloseOrdinaryErrandRuntimeOptions } from "./close-runtime.js";
import type { CloseTargetResolution } from "./close-locus.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";

type Refused = Extract<CloseTargetResolution, { kind: "refused" }>;

/** Require a local exact-subject checkout or a branch link naming that subject alone. */
export async function guardCloseSubjectBranch(options: Pick<CloseOrdinaryErrandRuntimeOptions,
  "store" | "projectId" | "readFrame" | "selectedRecord">, record: OrdinaryErrandRecord): Promise<Refused | null> {
  const store = options.store;
  if (!store?.capabilities.stateOffBranch) return null;
  const frame = await options.readFrame();
  if (frame.roster.some(row => row.subject?.kind === "errand"
    && row.subject.key === record.slug && row.subject.claimId === record.claimId)) return null;
  const message = `Run close on the machine holding the selected Errand '${record.slug}' checkout. `;
  const refuse = (detail: string): Refused => ({ kind: "refused", reason: "identity-conflict", message: message + detail });
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(store));
  if (project.status !== "ready") return refuse(`${project.reason} ${project.remedy.text}`);
  const branch = await store.lookup({ kind: "ref", repository: project.id, ref: record.branch });
  const readSelected = async () => options.selectedRecord === undefined
    ? await store.lookup({ kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse(record.slug), claimId: record.claimId } })
    : { status: "ok" as const, result: { reference: options.selectedRecord.reference } };
  if (branch.status === "refused") {
    if (branch.refusal.code !== "ambiguous-match" || record.state !== "awaiting-merge") {
      return refuse(`${branch.refusal.condition} ${branch.refusal.remedy.text}`);
    }
    const selected = await readSelected();
    if (selected.status === "refused") return refuse(`${selected.refusal.condition} ${selected.refusal.remedy.text}`);
    return leftSubjectTie(record, selected.result.reference, branch.refusal);
  }
  const selected = await readSelected();
  if (selected.status === "refused") return refuse(`${selected.refusal.condition} ${selected.refusal.remedy.text}`);
  return branch.result.reference.kind === "work-item/record" && sameReference(branch.result.reference, selected.result.reference)
    ? null : refuse("The branch link does not name this subject alone; no branch evidence was read.");
}

/** A subject left awaiting merge holds no checkout anywhere, so no machine can serve today's instruction; the exit that
 * lands is every other link holder's completion, after which the link names this subject alone. */
function leftSubjectTie(record: OrdinaryErrandRecord, subject: RecordReference,
  tie: Extract<StoreRefusal, { code: "ambiguous-match" }>): Refused {
  const exits = tie.candidates.filter(candidate => !sameReference(candidate, subject)).map(candidate => {
    const owner = candidate.owner, uid = owner.type === "person" ? undefined : owner.uid;
    const name = `${owner.name} (UID ${uid ?? "unavailable"})`;
    return candidate.kind === "work-item/record" && uid !== undefined
      ? `Errand ${name}: \`arc errand close ${uid}\` on the machine holding its checkout, or \`arc errand abandon ${uid}\``
      : `${owner.type} ${name}: its completion`;
  });
  return { kind: "refused", reason: "identity-conflict", message: `Errand '${record.slug}' was left awaiting merge, so no checkout `
    + `holds it, and branch '${record.branch}' is linked by another holder too; no branch evidence was read. Have each other `
    + `holder's owner complete it — ${exits.join("; ")} — then retry this close.` };
}
