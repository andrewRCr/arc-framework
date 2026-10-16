/** Marker-selected work-unit lifecycle evidence over the operational store. */
import { SlugSchema, WorkUnitStateSchema } from "../kernel/index.js";
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";
import type { GitExec } from "../git/exec.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import { createProjectIdentityReader } from "../store/project-identity.js";
import { parseLineageRecord } from "../store/kinds/lineage/parser.js";
import type { DerivedWorkUnitSubject, WorkUnitLifecycleProjection } from "./role-derivation.js";

/** A complete subject observation retains the exact record for context projection. */
export type StoreWorkUnitEvidence =
  | { kind: "absent" }
  | { kind: "unreadable"; reason: string; missingRecord?: boolean; code?: "subject-unresolved" }
  | { kind: "present"; subject: DerivedWorkUnitSubject; record: StoreRecord;
      fields: ParsedMetaRecord; branch: string | null; lifecycle: WorkUnitLifecycleProjection };
interface StoreWorkUnitInput {
  store: Store; slug: string; head: string; exec?: GitExec; baseBranch?: string;
  archiveCadence?: "manual" | "with-integration"; projectId?: () => Promise<string>;
}

/** Read a marker claim and its authoritative lifecycle without consulting checkout projections. */
export async function readStoreWorkUnitEvidence(input: StoreWorkUnitInput): Promise<StoreWorkUnitEvidence> {
  try {
    const record = await readClaimedWorkUnit(input.store, input.slug);
    const fields = ParsedMetaRecordSchema.parse(record.fields);
    WorkUnitStateSchema.parse(fields.state);
    const branch = await readWorkUnitBranch(input, record);
    const subject = { kind: "work-unit" as const, key: record.reference.owner.name };
    if (record.placement === undefined) throw new Error("The marker's work-unit record has no lifecycle placement.");
    const completed = record.placement.kind === "completed";
    const retired = completed && await completedWorkUnitRetired(input, record);
    const expectedTopology = branch === null ? {} : { branch, detached: false };
    return { kind: "present", subject, record, fields, branch,
      lifecycle: { kind: "present", subject, expectedTopology,
        state: retired ? "retired" : completed ? "integration" : "active" } };
  } catch (error) { return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error),
    ...(error instanceof MissingWorkUnitRecord ? { missingRecord: true } : {}),
    ...((error instanceof SubjectBranchUnavailable || error instanceof SubjectClaimUnavailable) ? { code: "subject-unresolved" as const } : {}) }; }
}
async function readClaimedWorkUnit(store: Store, slug: string): Promise<StoreRecord> {
  const result = await store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(slug) } });
  if (result.status === "refused" && result.refusal.code === "not-found") throw new MissingWorkUnitRecord(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  if (result.status === "refused" && result.refusal.code === "ambiguous-match") throw new SubjectClaimUnavailable(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  const lookup = unwrap(result);
  if (lookup.reference.kind !== "work-item/meta") throw new Error("The marker claim resolved to a non-work-unit record.");
  const record = unwrap(await store.read({ reference: lookup.reference }));
  if (record.conflicts.length > 0) throw new Error("The marker's work-unit record has unresolved conflicts.");
  return record;
}
async function readWorkUnitBranch(input: StoreWorkUnitInput, record: StoreRecord): Promise<string | null> {
  try {
  const repository = await (input.projectId ?? createProjectIdentityReader(input.store))();
  if (repository.trim() === "") throw new Error("Project identity is unavailable.");
  const selection = selectWorkBranchLink(record, { repository });
  if (selection.kind === "ambiguous") throw new Error(selection.reason);
  return selection.kind === "linked" ? workBranchName(selection.link.ref) : null;
  } catch (error) { throw new SubjectBranchUnavailable(error instanceof Error ? error.message : String(error), { cause: error }); }
}
async function completedWorkUnitRetired(input: StoreWorkUnitInput, record: StoreRecord): Promise<boolean> {
  if (input.archiveCadence === "manual" || record.links?.landingCommit !== undefined) return true;
  if (await terminalLineageRetires(input.store, record)) return true;
  if (input.exec === undefined || input.baseBranch === undefined) return false;
  const base = await resolveLandingBase(input.exec, input.baseBranch);
  return base === null ? false : isLandedInBaseStrict(input.exec, input.head, base);
}
async function terminalLineageRetires(store: Store, record: StoreRecord): Promise<boolean> {
  const origin = ("uid" in record.reference.owner ? record.reference.owner.uid : undefined) ?? record.reference.owner.name;
  const lineage = await store.lookup({ kind: "lineage", origin });
  if (lineage.status === "refused" && lineage.refusal.code === "not-found") return false;
  const read = unwrap(await store.read({ reference: unwrap(lineage).reference }));
  const terminal = parseLineageRecord(read.content);
  if (terminal === null) throw new Error("The work-unit lineage record is unreadable.");
  return terminal.kind === "decompose" || terminal.kind === "abandon";
}
async function resolveLandingBase(exec: GitExec, baseBranch: string): Promise<string | null> {
  for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
    try { const read = await exec("git", ["rev-parse", "--verify", "--quiet", candidate]); return read.stdout.trim() || null; }
    catch { /* A missing base cannot prove landing. */ }
  }
  return null;
}
function unwrap<T>(result: StoreResult<T>): T {
  if (result.status === "refused") throw new Error(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  return result.result;
}

class SubjectBranchUnavailable extends Error {}

class SubjectClaimUnavailable extends Error {}

class MissingWorkUnitRecord extends SubjectClaimUnavailable {}
