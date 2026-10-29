/** Prepare code traceability from the source checkout before qualifying imported project links. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { parseMetaRecord } from "../../../active/meta-reader.js";
import { TransientIdentityRecordSchema } from "../../../errand/identity-record.js";
import { ERRAND_BRANCH_TYPES } from "../../../errand/branch-type.js";
import { LinksSchema, type CommitCapture } from "../../links.js";
import { computeCopyKeys } from "../../../git/copy-key.js";
import { importTaskCaptures } from "./code-captures.js";
import { readImportCodeTip, resolveImportBranchTip } from "./branch-tip.js";

interface BranchSource { record: ImportRecord; branch: string; tip: string }

/** Acquire link facts against the original code repository without publishing a project identity. */
export async function prepareImportCodeLinks(context: RefBackendContext, records: ImportRecord[], report: MigrateReport,
  skipped: MigrateReport["notices"]): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const bases = [...new Set((await Promise.all([`refs/heads/${source.baseBranch}`, `refs/remotes/origin/${source.baseBranch}`]
    .map(ref => readImportCodeTip(source, ref)))).filter((tip): tip is string => tip !== null))];
  const branches = await readBranchSources(context, records, report);
  report.refused.sort((left, right) => refusalPriority(left.rule) - refusalPriority(right.rule));
  if (!bases.length) { await reportMissingBase(source, report); return; }
  await importTaskCaptures(context, records, [...bases, ...branches.filter(item => item.record.reference.kind === "work-item/meta").map(item => item.tip)], report, skipped);
  for (const branch of branches) await importBranchLink(context, branch, bases);
}

async function readBranchSources(context: RefBackendContext, records: readonly ImportRecord[], report: MigrateReport): Promise<BranchSource[]> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const branches: BranchSource[] = [];
  for (const record of records) {
    if (record.placement?.kind === "completed") continue;
    const branch = sourceBranch(record);
    if (!branch || branch === source.baseBranch) continue;
    const result = await resolveImportBranchTip(source, branch);
    if (result.status === "available") branches.push({ record, branch, tip: result.tip });
    else reportBranchRefusal(record, branch, result.status, report);
  }
  return branches;
}

function refusalPriority(rule: string): number { return rule === "branch-missing" || rule === "branch-diverged" ? 0 : 1; }

/** Retain the common branch refusal and repair guidance for every imported source. */
export function reportBranchRefusal(record: ImportRecord, branch: string, status: "missing" | "diverged", report: MigrateReport): void {
  report.refused.push({ reference: record.reference, rule: `branch-${status}` });
  const remedy = status === "diverged"
    ? `Merge or push '${branch}' until its local and origin-tracking tips have a containing tip, then retry arc store migrate --import.`
    : record.reference.kind === "work-item/meta"
      ? "Archive the work unit if its change merged; otherwise restore its branch, correct Branch, or abandon it, then retry arc store migrate --import."
      : "Close or abandon the Errand, or restore its recorded branch, then retry arc store migrate --import.";
  report.notices.push({ condition: `Branch '${branch}' for '${record.reference.owner.name}' is ${status}.`, remedy: { text: remedy } });
}

async function reportMissingBase(source: NonNullable<RefBackendContext["importSource"]>, report: MigrateReport): Promise<void> {
  const { stdout } = await source.ports.exec("git", ["remote"], { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const remedy = stdout.split(/\s+/u).includes("origin")
    ? `git fetch origin +refs/heads/${source.baseBranch}:refs/remotes/origin/${source.baseBranch}`
    : `git branch ${source.baseBranch} <commit>`;
  report.notices.push({ condition: `No base ref resolves for ${source.baseBranch}.`, remedy: { text: remedy } });
}

async function importBranchLink(context: RefBackendContext, { record, branch, tip }: BranchSource, bases: readonly string[]): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const excluded = record.reference.kind === "work-item/meta"
    ? await importBranchExclusions(source, tip, bases, Object.values(record.links?.taskCaptures ?? {}).flat()) : [];
  record.links = { ...record.links, branches: [{ repository: source.ports.checkoutRoot, ref: branch,
    linkedAs: createdBranch(record, branch) ? "created" : "adopted", excluded }] };
}

async function importBranchExclusions(source: NonNullable<RefBackendContext["importSource"]>, tip: string,
  bases: readonly string[], captures: readonly CommitCapture[]): Promise<CommitCapture[]> {
  const repository = source.ports.checkoutRoot;
  const walk = await source.ports.exec("git", ["--no-replace-objects", "rev-list", "--no-merges", tip, "--not", ...bases],
    { cwd: repository, objectAccess: "local-only" });
  const stored = captures.filter(capture => capture.repository === repository);
  const capturedShas = new Set(stored.map(capture => capture.sha));
  const capturedKeys = new Set(stored.flatMap(capture => capture.copyKey === undefined ? [] : [capture.copyKey]));
  const candidates = [...new Set(walk.stdout.trim().split(/\s+/u).filter(Boolean))].filter(sha => !capturedShas.has(sha));
  const keys = await computeCopyKeys({ cwd: repository, commits: candidates, execRaw: source.ports.rawExec });
  return candidates.flatMap(sha => {
    const copyKey = keys.get(sha)?.copyKey;
    return copyKey !== undefined && capturedKeys.has(copyKey) ? [] : [{ repository, sha, ...(copyKey === undefined ? {} : { copyKey }) }];
  });
}

function sourceBranch(record: ImportRecord): string | null {
  if (record.reference.kind === "work-item/meta") return parseMetaRecord(record.content).branch;
  if (record.reference.kind === "work-item/record") return TransientIdentityRecordSchema.parse(JSON.parse(record.content)).branch;
  return null;
}

function createdBranch(record: ImportRecord, branch: string): boolean {
  const slug = record.reference.owner.name;
  if (record.reference.kind === "work-item/record") return ERRAND_BRANCH_TYPES.some(type => branch === `${type}/${slug}`);
  const [type, name, ...rest] = branch.split("/");
  return type !== undefined && /^[a-z][a-z0-9-]*$/u.test(type) && name === slug && rest.length === 0;
}

/** Replace source-checkout qualification only after the import is admitted and its project ID is known. */
export function qualifyImportCodeLinks(records: ImportRecord[], repository: string): void {
  for (const record of records) {
    if (!record.links) continue;
    record.links = LinksSchema.parse({ ...record.links,
      ...(record.links.branches ? { branches: record.links.branches.map(branch => ({ ...branch, repository,
        excluded: branch.excluded.map(capture => ({ ...capture, repository })) })) } : {}),
      ...(record.links.taskCaptures ? { taskCaptures: Object.fromEntries(Object.entries(record.links.taskCaptures)
        .map(([task, captures]) => [task, captures.map(capture => ({ ...capture, repository }))])) } : {}),
    });
  }
}
