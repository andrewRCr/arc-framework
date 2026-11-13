/** Account for tracked source files through the import's own discovery and landed point reads. */
import type { WindowRequest } from "./main.js";
import type { WindowFinding, WindowResult } from "./result.js";
import { WindowRefusal } from "./result.js";
import { createWindowImportContext, type WindowImportContext } from "./import-context.js";
import { createWindowReadMap, type WindowReadMap } from "./read-map.js";
import { createWindowReadRule, type WindowReadRule } from "./read-rule.js";
import { readWindowRefTip } from "./git.js";
import { createWindowAccountingRecordReader, type WindowAccountingRecordReader } from "./account-records.js";
import type { RecordReference } from "../../lib/store/identity.js";
import { parseArgs } from "node:util";

/** One source coordinate and the evidence for whether its state crossed the import. */
export interface WindowAccountingEntry {
  path: string; revision: string; sourceRef: string | null; readCopyRef: string | null;
  reference: RecordReference | null; classification: "imported" | "superseded" | "deliberately-left" | "reported"; reason: string;
}
const deliberatelyLeft = new Map([
  [".arc/backlog/ROADMAP.md", "A rendered view, not an imported record."],
  [".arc/completed/README.md", "An installed archive guide, not an imported record."],
]);
interface AccountingScope { map: WindowReadMap; rule: WindowReadRule; read: WindowAccountingRecordReader }

/** Report every source file and refuse any unaccounted state without writing listing manifests. */
export async function accountWindow(request: WindowRequest): Promise<WindowResult> {
  parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" } } });
  const context = await createWindowImportContext(request.repo);
  const main = await readWindowRefTip({ repo: request.repo, exec: context.exec }, "refs/heads/main");
  if (main === null) throw new WindowRefusal([{ subject: "main", condition: "The importing main revision is unavailable.",
    remedy: "Restore the importing main branch and retry account." }]);
  const map = await createWindowReadMap(context, main);
  const files = await accountFiles(context, map);
  const findings: WindowFinding[] = [...map.findings, ...files.filter(file => file.classification === "reported").map(file => ({
    subject: `${file.sourceRef ?? file.revision}:${file.path}`, condition: file.reason,
    remedy: "Preserve this file and reconcile its source or landed record, then retry account or abort through restore.",
  }))];
  return { operation: "account", status: findings.length ? "findings" : "passed", findings, data: { files },
    messages: files.map(file => `${file.classification}: ${file.sourceRef ?? file.revision}:${file.path} (${file.reason})`) };
}

async function accountFiles(context: WindowImportContext, map: WindowReadMap): Promise<WindowAccountingEntry[]> {
  const scope: AccountingScope = { map, rule: createWindowReadRule(context, map), read: createWindowAccountingRecordReader(context, map) };
  const files: WindowAccountingEntry[] = [];
  for (const revision of new Set([map.main, ...map.readRevisions])) {
    const records = await map.records(revision);
    const paths = (await scope.rule.paths(revision)).filter(path => revision === map.main || records.has(path));
    for (const path of paths) {
      const mapped = await map.at(path, revision);
      if (revision !== map.main && (mapped.workUnit === null || mapped.readRevision !== revision)) continue;
      files.push(await accountFile(scope, path, revision, records.get(path)));
    }
  }
  return files;
}

async function accountFile(scope: AccountingScope, path: string, revision: string,
  reference: RecordReference | undefined): Promise<WindowAccountingEntry> {
  const inspected = await scope.rule.inspect(path, revision, revision !== scope.map.main);
  const coordinate = { path, revision, sourceRef: revision === scope.map.main ? "refs/heads/main" : inspected.readCopyRef,
    readCopyRef: inspected.readCopyRef, reference: reference ?? inspected.reference };
  const leftReason = deliberatelyLeft.get(path);
  if (leftReason !== undefined) return { ...coordinate, classification: "deliberately-left", reason: leftReason };
  if (!inspected.passes) return { ...coordinate, classification: "reported", reason: "The file fails the import read rule." };
  if (revision !== inspected.readRevision) return { ...coordinate, classification: "superseded",
    reason: `Read copy ${inspected.readCopyRef ?? "unavailable"} covers this content under the read rule.` };
  if (reference === undefined) return { ...coordinate, classification: "reported", reason: "No record claims this file at its read revision." };
  const landed = await scope.read(reference, revision, path);
  return { ...coordinate, classification: landed.held ? "imported" : "reported",
    reason: landed.held ? landed.reason : `The landed store did not establish coverage: ${landed.reason}` };
}
