/** Before reading a branch, prove it belongs to the Errand whose checkout is absent locally. */
import { SlugSchema } from "../kernel/index.js";
import { sameReference } from "../store/identity.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import type { CloseOrdinaryErrandRuntimeOptions } from "./close-runtime.js";
import type { CloseTargetResolution } from "./close-locus.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";

/** Require a local exact-subject checkout or a branch link naming that subject alone. */
export async function guardCloseSubjectBranch(options: Pick<CloseOrdinaryErrandRuntimeOptions,
  "store" | "projectId" | "readFrame" | "selectedRecord">, record: OrdinaryErrandRecord): Promise<
    Extract<CloseTargetResolution, { kind: "refused" }> | null> {
  const store = options.store;
  if (!store?.capabilities.stateOffBranch) return null;
  const frame = await options.readFrame();
  if (frame.roster.some(row => row.subject?.kind === "errand"
    && row.subject.key === record.slug && row.subject.claimId === record.claimId)) return null;
  const message = `Run close on the machine holding the selected Errand '${record.slug}' checkout. `;
  const refuse = (detail: string): Extract<CloseTargetResolution, { kind: "refused" }> =>
    ({ kind: "refused", reason: "identity-conflict", message: message + detail });
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(store));
  if (project.status !== "ready") return refuse(`${project.reason} ${project.remedy.text}`);
  const branch = await store.lookup({ kind: "ref", repository: project.id, ref: record.branch });
  if (branch.status === "refused") return refuse(`${branch.refusal.condition} ${branch.refusal.remedy.text}`);
  const selected = options.selectedRecord === undefined
    ? await store.lookup({ kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse(record.slug), claimId: record.claimId } })
    : { status: "ok" as const, result: { reference: options.selectedRecord.reference } };
  if (selected.status === "refused") return refuse(`${selected.refusal.condition} ${selected.refusal.remedy.text}`);
  return branch.result.reference.kind === "work-item/record" && sameReference(branch.result.reference, selected.result.reference)
    ? null : refuse("The branch link does not name this subject alone; no branch evidence was read.");
}
