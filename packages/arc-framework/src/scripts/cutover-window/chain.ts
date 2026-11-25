/** Compare every discovered Candidate through repository and imported-store chain readers. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MigrateReportSchema, type MigrateReport } from "../../lib/store/commands.js";
import { createRefStore } from "../../lib/store/create.js";
import { readCapturedLookupTrees } from "../../lib/store/ref/lookup-trees.js";
import { resolveCapturedReference } from "../../lib/store/ref/reference-resolution.js";
import { createWindowImportContext } from "./import-context.js";
import { createWindowReadMap, type WindowReadMap } from "./read-map.js";
import { listWindowRefs, readWindowRefTip } from "./git.js";
import { compareWindowCandidate, type WindowCandidateSource, type WindowCandidateComparison } from "./chain-candidate.js";
import type { WindowRequest } from "./main.js";
import { WindowRefusal, type WindowResult, type WindowFinding } from "./result.js";

const reportSchema = z.strictObject({ status: z.literal("ok"), result: MigrateReportSchema.extend({ move: z.literal("import") }) });

/** Read the import's JSON report and compare its exact Candidate sources without listing manifests. */
export async function chainWindow(request: WindowRequest): Promise<WindowResult> {
  const { values } = parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" }, report: { type: "string" } } });
  if (!values.report) throw new WindowRefusal([{ subject: "import report", condition: "The import's --json report is required.", remedy: "Supply --report with the successful import report and retry chain." }]);
  const path = resolve(request.repo, values.report);
  let report: MigrateReport;
  try { report = reportSchema.parse(JSON.parse(await readFile(path, "utf8"))).result; }
  catch (error) { throw new WindowRefusal([{ subject: path, condition: `Cannot read a successful import report: ${String(error)}`, remedy: "Supply the successful import's complete --json output and retry chain." }]); }
  const context = await createWindowImportContext(request.repo), io = { repo: request.repo, exec: context.exec };
  const main = await readWindowRefTip(io, "refs/heads/main");
  if (main === null) throw new WindowRefusal([{ subject: "main", condition: "The importing main revision is unavailable.", remedy: "Restore main and retry chain." }]);
  const map = await createWindowReadMap(context, main), sources = await candidateSources(map);
  const captured = await readCapturedLookupTrees(context, await listWindowRefs(io, ["refs/arc/work/", "refs/arc/archive/"]));
  if (captured.status !== "ok") throw new WindowRefusal([{ subject: "Candidate owners", condition: captured.refusal.condition, remedy: captured.refusal.remedy.text }]);
  const store = createRefStore(context), candidates: WindowCandidateComparison[] = [], findings: WindowFinding[] = [...map.findings];
  for (const source of sources) {
    const owner = resolveCapturedReference(context, source.reference, captured.result.trees, captured.result.unreadable);
    if (owner.status !== "ok") { findings.push({ subject: source.path, condition: owner.refusal.condition, remedy: owner.refusal.remedy.text }); continue; }
    const result = await compareWindowCandidate(context, store, source, owner.result, report);
    candidates.push(result); findings.push(...result.findings);
  }
  return { operation: "chain", status: findings.length ? "findings" : "passed", findings, data: { candidates },
    messages: candidates.flatMap(candidate => [`${candidate.workUnit}: ${candidate.equal ? "equal" : candidate.findings.length ? "different" : "listed difference"}`,
      ...candidate.listed.map(entry => `listed: ${entry.subject}: ${entry.condition}`)]) };
}

async function candidateSources(map: WindowReadMap): Promise<WindowCandidateSource[]> {
  const sources = new Map<string, WindowCandidateSource>();
  for (const revision of new Set([map.main, ...map.readRevisions])) {
    for (const [path, reference] of await map.records(revision)) {
      if (reference.kind !== "review/candidate") continue;
      if ((await map.at(path, revision)).readRevision !== revision) continue;
      sources.set(reference.owner.name, { path, revision, reference });
    }
  }
  return [...sources.values()];
}
