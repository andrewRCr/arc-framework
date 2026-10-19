/** Acquire parked work from a containing branch tip and preserve its parking evidence. */
import type { RefBackendContext } from "../context.js";
import type { InRepoContext } from "../../in-repo/context.js";
import type { MigrateReport } from "../../commands.js";
import type { ListingDiagnostic, StoreRecord } from "../../read.js";
import { RecordReferenceSchema, StateVersionSchema } from "../../identity.js";
import { heldMetaSources, type MetaSource } from "../../in-repo/meta.js";
import { parseMetaRecord } from "../../../active/meta-reader.js";
import { MetaPauseSchema } from "../../../active/meta-schema.js";
import { writeMetaPause } from "../../kinds/meta/section-writer.js";
import { pauseProseProblem } from "../../kinds/meta/pause-section.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";
import { resolveImportBranchTip } from "./branch-tip.js";
import { reportBranchRefusal } from "./code-links.js";
import { readBatchObjects } from "../batch-read.js";

/** A parked owner's exact code-history and content acquisition bounds. */
export interface ParkedImportSource { meta: StoreRecord; revision: string; asOf: ReturnType<typeof StateVersionSchema.parse> }
/** Parked names are withheld from ordinary acquisition even when their pinned source refuses. */
export interface ParkedImportSources { names: Set<string>; available: ParkedImportSource[] }

/** Resolve physical Active pointers separately from ordinary lifecycle source precedence. */
export async function readImportParkedSources(context: RefBackendContext, internal: InRepoContext,
  report: MigrateReport, codeHead: string): Promise<ParkedImportSources> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const result: ParkedImportSources = { names: new Set(), available: [] };
  for (const pointer of (await heldMetaSources(internal)).filter(isActivePointer)) {
    const fields = parseMetaRecord(pointer.content);
    result.names.add(pointer.slug);
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: pointer.slug } });
    const tip = fields.branch === null ? { status: "missing" as const } : await resolveImportBranchTip(source, fields.branch);
    if (tip.status !== "available") {
      reportBranchRefusal({ reference, content: pointer.content }, fields.branch ?? "[none]", tip.status, report);
      continue;
    }
    const asOf = StateVersionSchema.parse((await source.ports.exec("git", ["rev-parse", `${tip.tip}^{tree}`],
      { cwd: source.ports.checkoutRoot, objectAccess: "local-only" })).stdout.trim());
    const read = await source.store.read({ reference, asOf });
    if (read.status === "refused") { report.notices.push({ condition: read.refusal.condition, remedy: read.refusal.remedy }); continue; }
    const since = await firstPointerTime(context, pointer.path, codeHead);
    if (since === null) {
      report.notices.push({ condition: `The first parking commit for '${pointer.slug}' cannot be resolved.`,
        remedy: { text: "Restore the committed pointer history, then retry arc store migrate --import." } });
      continue;
    }
    const meta = pausedMeta(read.result, pointer.content, since, report);
    if (meta) result.available.push({ meta, revision: tip.tip, asOf });
  }
  return result;
}

function isActivePointer(pointer: MetaSource): pointer is MetaSource & { content: string } {
  return pointer.location === "planned" && pointer.content !== null && pointer.fields !== undefined
    && SlugSchema.safeParse(pointer.slug).success && parseMetaRecord(pointer.content).state === "Active";
}

function pausedMeta(meta: StoreRecord, pointer: string, since: string, report: MigrateReport): StoreRecord | undefined {
  const pause = MetaPauseSchema.safeParse({ pausedBy: parseMetaRecord(meta.content).owner, since,
    reason: /^> Reason:[ \t]?(.*)$/mu.exec(pointer)?.[1]?.trim() ?? "" });
  const problem = pause.success ? pauseProseProblem(pause.data) : null;
  if (!pause.success || problem !== null) {
    const fields = pause.success ? "Reason" : [...new Set(pause.error.issues.map(issue => issue.path[0] === "pausedBy"
      ? "Owner" : issue.path[0] === "reason" ? "Reason" : String(issue.path[0])))].join(", ");
    report.refused.push({ reference: meta.reference, rule: "pause" });
    report.notices.push({ condition: `Pause for '${meta.reference.owner.name}' has invalid ${fields}.${problem ? ` ${problem}` : ""}`,
      remedy: { text: "Write a nonempty Reason without section headings or separators, or correct the meta's Owner to a slug; then retry arc store migrate --import." } });
    return;
  }
  const content = writeMetaPause(meta.content, pause.data);
  return { ...meta, content, fields: parseMetaRecord(content), placement: { kind: "active" } };
}

async function firstPointerTime(context: RefBackendContext, path: string, codeHead: string): Promise<string | null> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const log = await source.ports.exec("git", ["log", codeHead, "--format=%H%x00%ct", "--", path],
    { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const commits = log.stdout.split(/\r?\n/u).filter(Boolean).reverse().map(line => line.split("\0"));
  const objects = await readBatchObjects({ ...context, checkoutRoot: source.ports.checkoutRoot, rawExec: source.ports.rawExec,
    readSource: undefined, blobStage: undefined }, commits.map(([sha]) => `${sha}:${path}`));
  for (const [sha, time] of commits) {
    const object = objects.get(`${sha}:${path}`);
    if (object?.type !== "blob" || !/^> \*\*Parked\*\*/mu.test(Buffer.from(object.bytes).toString("utf8"))) continue;
    const date = new Date(Number(time) * 1000);
    return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
  }
  return null;
}

/** Exclude only diagnostics belonging to an owner acquired through its explicit parked snapshot. */
export function isParkedSourceDiagnostic(diagnostic: ListingDiagnostic, names: ReadonlySet<string>): boolean {
  return [...names].some(name => diagnostic.key === `work-item:${name}`
    || new RegExp(`(?:^|/)[^/]+-${name}\\.md$`, "u").test(diagnostic.key));
}
