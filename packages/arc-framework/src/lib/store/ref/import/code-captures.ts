/** Batch-read reachable commit footers and bind their closed tasks to imported owners. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { readBatchObjects, type BatchObject } from "../batch-read.js";
import { parseCommitMessage } from "../../../commit-check/parser.js";
import { expandTaskReference } from "../../../commit-check/task-reference.js";
import { contextAttribution } from "../../in-repo/lookup.js";
import { scanTaskListStructure } from "../../../task-list/scanner.js";
import { computeCopyKeys } from "../../../git/copy-key.js";

interface CapturableWork { primary: ImportRecord; ids: string[]; closed: Set<string> }
interface AttributedCommit { sha: string; work: CapturableWork; tasks: string[] }

/** Walk each reachable commit once and acquire its object in bounded Git batches. */
export async function importTaskCaptures(context: RefBackendContext, records: ImportRecord[], tips: readonly string[], report: MigrateReport): Promise<void> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  if (!tips.length) return;
  const index = capturableWork(records, report);
  if (![...index.values()].some(works => works.some(work => work.closed.size > 0))) return;
  const walk = await source.ports.exec("git", ["--no-replace-objects", "rev-list", ...new Set(tips)], { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  const shas = walk.stdout.trim().split(/\s+/u).filter(Boolean);
  const objects = await readBatchObjects({ ...context, rawExec: source.ports.rawExec, checkoutRoot: source.ports.checkoutRoot,
    readSource: undefined, blobStage: undefined }, shas);
  const attributed = attributedCommits(objects, shas, index, report);
  const keys = await computeCopyKeys({ cwd: source.ports.checkoutRoot, commits: attributed.map(item => item.sha), execRaw: source.ports.rawExec });
  for (const { sha, work, tasks } of attributed) {
    const copyKey = keys.get(sha)?.copyKey;
    if (copyKey === undefined) continue;
    const links = work.primary.links ??= {};
    const captures = links.taskCaptures ??= {};
    for (const task of tasks) (captures[task] ??= []).push({ repository: source.ports.checkoutRoot, sha, copyKey });
  }
}

function attributedCommits(objects: ReadonlyMap<string, BatchObject | null>, shas: readonly string[],
  index: ReadonlyMap<string, CapturableWork[]>, report: MigrateReport): AttributedCommit[] {
  const attributed: AttributedCommit[] = [];
  const ambiguous = new Set<string>();
  for (const sha of shas) {
    const attribution = commitAttribution(objects.get(sha));
    if (!attribution?.tasks) continue;
    const matches = index.get(attribution.slug) ?? [];
    if (matches.length > 1) { ambiguous.add(attribution.slug); continue; }
    const work = matches[0];
    if (!work) continue;
    const tasks = expandTaskReference(attribution.tasks, work.ids).filter(task => work.closed.has(task));
    if (tasks.length) attributed.push({ sha, work, tasks });
  }
  for (const slug of ambiguous) report.notices.push({ condition: `Commit footers name ambiguous work item '${slug}'.`,
    remedy: { text: "Repair the conflicting work-item names or rename lineage, then retry arc store migrate --import." } });
  return attributed;
}

function commitAttribution(object: BatchObject | null | undefined): ReturnType<typeof contextAttribution> {
  if (object?.type !== "commit") return;
  const content = Buffer.from(object.bytes).toString("utf8");
  const separator = content.indexOf("\n\n");
  if (separator < 0) return;
  const footer = parseCommitMessage(content.slice(separator + 2)).contextTrailer;
  return footer?.key === "Context" ? contextAttribution(footer.value) : undefined;
}

function capturableWork(records: readonly ImportRecord[], report: MigrateReport): Map<string, CapturableWork[]> {
  const index = new Map<string, CapturableWork[]>();
  for (const taskList of records.filter(record => record.reference.kind === "work-item/task-list")) {
    const owner = taskList.reference.owner;
    if (owner.type !== "work-item") continue;
    const primary = records.find(record => record.reference.kind === "work-item/meta" && record.reference.owner.type === "work-item"
      && record.reference.owner.uid === owner.uid && record.reference.owner.name === owner.name);
    if (!primary) continue;
    const scan = scanTaskListStructure(taskList.content);
    if (scan.status === "malformed") {
      report.notices.push({ condition: `Task list for '${primary.reference.owner.name}' cannot be scanned.`,
        remedy: { text: "Repair its task markers, then retry arc store migrate --import." } });
      continue;
    }
    const tasks = scan.events.filter(event => event.type === "parent" || event.type === "subtask");
    const work = { primary, ids: tasks.map(task => task.item.id), closed: new Set(tasks.filter(task => task.marker !== " ").map(task => task.item.id)) };
    for (const name of [primary.reference.owner.name, ...(primary.formerSlugs ?? [])]) index.set(name, [...(index.get(name) ?? []), work]);
  }
  return index;
}
