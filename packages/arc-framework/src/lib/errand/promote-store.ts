/** Store-backed frame steps composed by ordinary Errand promotion. */
import { SlugSchema, CanonicalDigestSchema } from "../kernel/index.js";
import { TransientIdentityRecordV3Schema } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import type { PromoteFloor, PromoteOrdinaryErrandDependencies, PromotionFrameReceipt, PromotionFrameResult } from "./promote.js";
import { renderMetaFile } from "../store/kinds/meta/writers.js";
import { ParsedMetaRecordSchema, MetaPrioritySchema, MetaWorkClassSchema } from "../active/meta-schema.js";
import { RecordReferenceSchema, sameReference } from "../store/identity.js";
import { batchLifecycleWrites, mergeLifecycleLinks, recordWritePlacement, workUnitMetaPath } from "../store/lifecycle-write.js";
import { workBranchName } from "../store/lifecycle-branch.js";
import { GitProcessError } from "../git/process-error.js";
import type { GitExec } from "../git/exec.js";
import type { Store, HistoryEntry } from "../store/contract.js";
import { CommitShaSchema } from "../store/links.js";
import type { StoreRecord } from "../store/read.js";
/** Caller-owned checkout frame metadata stays outside these storage steps. */
export interface StorePromotionOptions {
  store: Store; exec: GitExec; cwd: string; repository: string; slug: string; name: string; type?: string;
  floor: PromoteFloor; owner: string; priority?: string; class?: string;
  frame: Pick<PromotionFrameReceipt, "checkoutPath" | "allocation" | "parentCheckoutPath">;
}
/** Storage-facing dependency slots; settlement remains the runtime caller's responsibility. */
export type StorePromotionSteps = Pick<PromoteOrdinaryErrandDependencies, "readIdentity" | "recoverPromoted" | "replaceFrame" | "retire">;

/** Build expected-version role change and its recoverable branch cut.
 * @param options - Bound store, Git, target, floor, and checkout metadata.
 * @returns Identity, frame, recovery, and retirement steps for the existing composition.
 */
export function createStorePromotionSteps(options: StorePromotionOptions): StorePromotionSteps {
  let basis: StoreRecord | undefined;
  return {
    readIdentity: async () => {
      const primary = await readPrimary(options);
      if (primary.kind !== "ready") return primary;
      basis = primary.record ?? undefined;
      if (basis === undefined || basis.reference.kind === "work-item/meta") return { kind: "ready", record: null };
      try { return { kind: "ready", record: TransientIdentityRecordV3Schema.parse(JSON.parse(basis.content)) }; }
      catch (error) { return { kind: "error", message: message(error) }; }
    },
    recoverPromoted: async () => recover(options),
    replaceFrame: async (source) => {
      if (basis === undefined || basis.reference.kind !== "work-item/record") return refused("No exact Errand primary was read before promotion.");
      return replace(options, source, basis);
    },
    retire: () => Promise.resolve({ kind: "idempotent" }),
  };
}
async function readPrimary(options: StorePromotionOptions): Promise<{ kind: "ready"; record: StoreRecord | null } | { kind: "refused"; reason: string }> {
  const lookup = await options.store.lookup({ kind: "slug", slug: SlugSchema.parse(options.slug) });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found" ? { kind: "ready", record: null }
    : { kind: "refused", reason: lookup.refusal.condition };
  const read = await options.store.read({ reference: lookup.result.reference });
  return read.status === "refused" ? { kind: "refused", reason: read.refusal.condition } : { kind: "ready", record: read.result };
}
async function replace(options: StorePromotionOptions, source: OrdinaryErrandRecord, basis: StoreRecord): Promise<PromotionFrameResult> {
  const branch = `${options.type ?? "feat"}/${options.name}`;
  const inherited = basis.links?.branches?.find((link) => link.repository === options.repository && workBranchName(link.ref) === source.branch);
  if (inherited === undefined) return refused("The Errand's exact repository-qualified branch link is missing.");
  await options.exec("git", ["check-ref-format", "--branch", branch], { cwd: options.cwd });
  if (await localBranchExists(options, branch)) return refused(`The target branch ${branch} already exists; choose another work-unit name or type.`);
  const tip = CommitShaSchema.parse((await options.exec("git", ["--no-replace-objects", "rev-parse", "--verify", `refs/heads/${source.branch}^{commit}`],
    { cwd: options.cwd, objectAccess: "local-only" })).stdout.trim());
  const reference = RecordReferenceSchema.parse({ ...basis.reference, kind: "work-item/meta", owner: { ...basis.reference.owner, name: options.name } });
  const content = promotionMeta(options, source);
  const placement = recordWritePlacement(basis);
  const links = mergeLifecycleLinks(basis.links, { branches: [{ repository: options.repository, ref: branch, linkedAs: "created", excluded: inherited.excluded }] });
  const written = await batchLifecycleWrites(options.store, [{ action: "put", reference, expected: basis.version, content,
    ...(placement === undefined ? {} : { placement }), links }], { verb: "errand-promote", lifecycleAction: "promote", codeHead: tip });
  if (written.status === "refused") return refused(`${written.refusal.code}: ${written.refusal.condition}\n${written.refusal.remedy.text}`);
  await options.exec("git", ["branch", branch, tip], { cwd: options.cwd });
  await options.exec("git", ["switch", branch], { cwd: options.cwd });
  const meta = await options.store.read({ reference });
  if (meta.status === "refused") return refused(meta.refusal.condition);
  return receipt(options, meta.result, source, branch, "applied");
}
function promotionMeta(options: StorePromotionOptions, source: OrdinaryErrandRecord): string {
  return renderMetaFile(options.name, { owner: options.owner, state: options.floor === "derivation" ? "Planning" : "Active",
    currentWorkflow: options.floor === "derivation" ? "draft-design" : "process-task-loop",
    nextAction: options.floor === "derivation" ? "Resolve the design before further implementation." : "Backfill a brief spec and task list, then continue implementation.",
    promotionReceipt: `errand-v1/${source.slug}/${source.claimId}`,
    ...(options.priority === undefined ? {} : { priority: MetaPrioritySchema.parse(options.priority) }),
    ...(options.class === undefined ? {} : { workClass: MetaWorkClassSchema.parse(options.class) }) });
}
async function recover(options: StorePromotionOptions): Promise<PromotionFrameResult | null> {
  const read = await readPrimary(options);
  if (read.kind !== "ready") return refused(read.reason);
  if (read.record === null || read.record.reference.kind !== "work-item/meta") return null;
  const meta = read.record, fields = ParsedMetaRecordSchema.parse(meta.fields);
  const history = await options.store.history({ reference: meta.reference });
  if (history.status === "refused") return refused(history.refusal.condition);
  const recovered = sourceFromHistory(history.result, options.slug, fields.promotionReceipt, meta);
  if (recovered === undefined || meta.reference.owner.name !== options.name) return refused("The primary lacks this exact Errand promotion receipt and history.");
  const { source, tip } = recovered;
  if (tip === undefined) return refused("The promotion role-write history lacks its exact cut commit. Inspect and repair that evidence before retrying this promotion.");
  const branch = `${options.type ?? "feat"}/${options.name}`;
  const linked = meta.links?.branches?.some((link) => link.repository === options.repository && link.ref === branch && link.linkedAs === "created");
  if (!linked) return refused("The promoted work branch's created link is missing.");
  const current = await localBranchTip(options, branch);
  if (current !== undefined && current !== tip) return refused(
    `Promotion branch conflict: ${branch} is at ${current}, but the role write recorded ${tip}. Preserve the existing branch, repair the target to that recorded cut (or move the unrelated branch aside), then retry this exact promotion.`);
  if (current === undefined) await options.exec("git", ["branch", branch, tip], { cwd: options.cwd });
  await options.exec("git", ["switch", branch], { cwd: options.cwd });
  return receipt(options, meta, source, branch, "idempotent");
}
function sourceFromHistory(entries: readonly HistoryEntry[], slug: string,
  promotionReceipt: string | null, meta: StoreRecord): { source: OrdinaryErrandRecord; tip: string | undefined } | undefined {
  for (const [index, entry] of entries.entries()) {
    if (entry.reference.kind !== "work-item/record" || entry.content === null) continue;
    let decoded: unknown; try { decoded = JSON.parse(entry.content); } catch { continue; }
    const parsed = TransientIdentityRecordV3Schema.safeParse(decoded);
    if (!parsed.success || parsed.data.kind !== "errand" || parsed.data.purpose !== "errand" || parsed.data.slug !== slug) continue;
    const source = parsed.data;
    if (promotionReceipt !== `errand-v1/${source.slug}/${source.claimId}`) continue;
    const role = entries[index - 1];
    const provenance = role?.provenance;
    const tip = role?.reference.kind === "work-item/meta" && sameReference(role.reference, meta.reference)
      && provenance !== undefined && "verb" in provenance && provenance.verb === "errand-promote"
      && provenance.lifecycleAction === "promote" ? provenance.codeHead : undefined;
    return { source, tip };
  }
  return undefined;
}
function receipt(options: StorePromotionOptions, meta: StoreRecord, source: OrdinaryErrandRecord, branch: string,
  kind: "applied" | "idempotent"): PromotionFrameReceipt {
  return { ...options.frame, kind, subject: { slug: source.slug, claimId: source.claimId },
    generation: `errand-v1/${source.slug}/${source.claimId}`, branch, metaPath: workUnitMetaPath(meta),
    metaCommitted: true, originEntry: source.originEntry,
    originEntrySourceDigest: source.origin === "inbox" ? CanonicalDigestSchema.parse(source.originEntrySourceDigest) : null };
}
async function localBranchExists(options: StorePromotionOptions, branch: string): Promise<boolean> {
  return (await localBranchTip(options, branch)) !== undefined;
}
async function localBranchTip(options: StorePromotionOptions, branch: string): Promise<string | undefined> {
  try { return CommitShaSchema.parse((await options.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`],
    { cwd: options.cwd, objectAccess: "local-only" })).stdout.trim()); }
  catch (error) { if (error instanceof GitProcessError && error.exitCode === 1) return undefined; throw error; }
}
function refused(message: string): PromotionFrameResult { return { kind: "refused", reason: "promotion-source-invalid", message }; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
