/** Independent writer exercising the public store over a shared real repository. */
import { createRefStore, createDefaultStorePorts, createRefLockFactory, RecordReferenceSchema, type WriteInput } from "../../../src/lib/store/index.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { RefProcessJobSchema, RefProcessReportSchema, type RefProcessReport } from "./ref-process-protocol.js";

const job = RefProcessJobSchema.parse(JSON.parse(process.argv[3] ?? "null"));
const root = process.argv[2];
if (!root) throw new Error("A writer requires a checkout");
const defaults = createDefaultStorePorts({ checkoutRoot: root }), native = createRefLockFactory(defaults);
const report: RefProcessReport = { outcomes: [], retries: [], refusals: [] };
let paused = false;
const resume = async () => {
  process.stdout.write("READY\n");
  await new Promise<void>((resolve) => process.stdin.once("data", () => { process.stdin.pause(); resolve(); }));
};
const store = createRefStore({ ...defaults, rawExec: createExecaRawGitExec(root),
  identity: async () => SlugSchema.parse(job.identity), actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000001`,
  random: Math.random, sleep: { wait: async () => {}, bound: async () => {} },
  lock: async (ref, wait) => {
    if (job.mode === "write" && job.pause && !paused && ref !== "layout") { paused = true; await resume(); }
    return native(ref, wait);
  },
});
const provenance = { verb: "test-write", lifecycleAction: "edit" };
async function write(input: WriteInput): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await store.write(input);
    if (result.status === "refused") report.refusals.push(result.refusal);
    if (result.status !== "refused" || result.refusal.code !== "version-conflict" || attempt === 4) {
      report.outcomes.push(result); report.retries.push(attempt); return;
    }
    const current = await store.read({ reference: input.reference });
    if (current.status !== "ok") throw new Error(`A retry cannot read its current record: ${JSON.stringify(current)}`);
    input = { ...input, expected: current.result.version };
  }
}
async function relocate(kind: "active" | "completed", quarter = "2026-q4"): Promise<void> {
  if (job.mode !== "lifecycle") throw new Error("A lifecycle operation requires its primary");
  const current = await store.read({ reference: job.primary });
  if (current.status !== "ok") throw new Error(`Missing lifecycle primary: ${JSON.stringify(current)}`);
  await write({ action: "put", reference: current.result.reference, expected: current.result.version,
    content: current.result.content, placement: kind === "active" ? { kind } : { kind, quarter: ArchiveQuarterSchema.parse(quarter) },
    provenance: { ...provenance, verb: kind === "active" ? "reopen" : "archive" } });
}
if (job.mode === "burst") {
  await resume();
  for (let iteration = 0; iteration < job.iterations; iteration += 1) {
    await write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: job.identity },
      key: `scratch/writer-${job.writer}-${iteration}.md` }), expected: null, content: `writer ${job.writer}, iteration ${iteration}\n`, provenance });
  }
} else if (job.mode === "write") await write(job.input);
else if (job.action === "abandon") {
  const primary = await store.read({ reference: job.primary });
  if (primary.status !== "ok" || primary.result.reference.owner.type !== "work-item" || !primary.result.reference.owner.uid) throw new Error("Missing origin UID");
  const owner = primary.result.reference.owner;
  report.outcomes.push(await store.batch({ provenance: { ...provenance, verb: "abandon" }, writes: [
    { action: "remove", reference: primary.result.reference, expected: primary.result.version },
    { action: "put", reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }) },
  ] }));
} else {
  await relocate(job.action === "archive" ? "completed" : "active");
  if (job.action === "reopen-and-archive") await relocate("completed", "2027-q1");
}
process.stdout.write(`${JSON.stringify(RefProcessReportSchema.parse(report))}\n`);
