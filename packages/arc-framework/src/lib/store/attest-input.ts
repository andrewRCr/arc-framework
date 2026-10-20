/** Metadata and closed-task admission for Candidate attestation. */
import { posix } from "node:path";
import { parseMetaRecord } from "../active/meta-reader.js";
import type { ParsedMetaRecord } from "../active/meta-schema.js";
import { resolveTaskListPath } from "../../commands/active.js";
import { materializeArcPath } from "../layout/index.js";
import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { Remedy } from "./refusal.js";
import { readWorkUnit, readLifecycleMetaFields, workUnitMetaPath } from "./lifecycle-write.js";
import { checkAdvancingPause } from "./lifecycle-pause.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";
import { recordReferences } from "./identity.js";
import { describeRecordConflicts } from "./conflict-diagnostics.js";
import { resolveLastCompletedTask, resolveTaskListCursor } from "../task-list/cursor.js";
import { attestArgv, attestNewRootArgv, spineRemedy } from "../../scripts/integration/spine-refusal.js";

/** Physical input reads remain available to the repository-backed arm. */
export interface AttestInputPorts {
  cwd: string;
  store?: Store;
  readFile(path: string): Promise<string>;
  readArchivedMeta(name: string): Promise<{ location: string; path: string } | undefined>;
  activeMetaPath(name: string): ManagedPath;
}
/** Exact input basis retained for the publication batch. */
export type AttestInputResult = { status: "ready"; primary?: StoreRecord; metaPath: ManagedPath; metaContent: string;
  meta: ParsedMetaRecord; lifecycle: "Active" | "Integrating" | "Shipped"; taskListPath: string; taskList: string;
  lastCompleted: string | null } | { status: "rejected"; reason: string; remedy: Remedy };
type Metadata = { primary?: StoreRecord; metaPath: ManagedPath; metaContent: string; meta: ParsedMetaRecord };
type Rejected = Extract<AttestInputResult, { status: "rejected" }>;

function reject(name: string, newRoot: boolean, reason: string, text = "Repair the task list and close execution before attesting",
  invariant = "Candidate attestation requires a resolvable, structurally closed task list."): Rejected {
  return { status: "rejected", reason, remedy: spineRemedy(
    invariant, text,
    newRoot ? attestNewRootArgv(name) : attestArgv(name)) };
}

async function readMetadata(ports: AttestInputPorts, name: string, newRoot: boolean): Promise<Metadata | Rejected> {
  if (ports.store?.capabilities.stateOffBranch === true) {
    const read = await readWorkUnit(ports.store, name);
    if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, remedy: read.refusal.remedy };
    const primary = read.result, fields = readLifecycleMetaFields(primary);
    if (fields.status === "refused") return { status: "rejected", reason: fields.refusal.condition, remedy: fields.refusal.remedy };
    if (primary.conflicts.length > 0) return reject(name, newRoot,
      `Attestation metadata has unresolved conflicts.${describeRecordConflicts(primary.conflicts)}`, "Resolve the named conflict records, then retry attestation",
      "Candidate attestation requires settled metadata authority.");
    return { primary, metaPath: validateManagedPath(workUnitMetaPath(primary)), metaContent: primary.content, meta: fields.result };
  }
  let metaPath = ports.activeMetaPath(name), metaContent: string;
  try { metaContent = await ports.readFile(materializeArcPath(ports.cwd, metaPath)); }
  catch {
    const archived = await ports.readArchivedMeta(name);
    if (!newRoot || archived?.location !== "completed") return { status: "rejected",
      reason: `\`arc attest\` requires an active record, or an archived record with \`--new-root\`, for \`${name}\`.`,
      remedy: spineRemedy("Candidate attestation requires a resolvable work-unit record.",
        "Inspect the work-unit lifecycle state", ["arc", "status", name, "--json"]) };
    metaPath = validateManagedPath(archived.path);
    metaContent = await ports.readFile(materializeArcPath(ports.cwd, metaPath));
  }
  return { metaPath, metaContent, meta: parseMetaRecord(metaContent) };
}

async function readTasks(ports: AttestInputPorts, basis: Metadata, name: string, newRoot: boolean): Promise<
  { taskListPath: string; taskList: string } | Rejected> {
  if (ports.store?.capabilities.stateOffBranch === true && basis.primary !== undefined) {
    const pause = await checkAdvancingPause(ports.store, name, basis.primary);
    if (pause.status === "rejected") return { status: "rejected", reason: pause.reason,
      remedy: pause.remedy ?? pause.refusal?.remedy ?? { text: "Repair the pause fields, then retry." } };
    const task = await ports.store.read({ reference: recordReferences["work-item/task-list"](basis.primary.reference.owner) });
    if (task.status === "refused") return { status: "rejected", reason: task.refusal.condition, remedy: task.refusal.remedy };
    if (task.result.conflicts.length > 0) return reject(name, newRoot,
      `Attestation task list has unresolved conflicts.${describeRecordConflicts(task.result.conflicts)}`, "Resolve the named conflict records, then retry attestation");
    const path = lifecycleRecordPath(basis.primary, task.result);
    if (path === null || basis.meta.taskList !== posix.basename(path)) return reject(name, newRoot,
      `\`arc attest\` requires a canonical task-list binding for \`${name}\`.`);
    return { taskListPath: path, taskList: task.result.content };
  }
  const taskListPath = resolveTaskListPath(basis.metaPath, basis.meta.taskList);
  if (taskListPath === null) return reject(name, newRoot, `\`arc attest\` requires a canonical task-list binding for \`${name}\`.`,
    "Restore the task-list binding and close execution before attesting");
  try { return { taskListPath, taskList: await ports.readFile(materializeArcPath(ports.cwd, validateManagedPath(taskListPath))) }; }
  catch { return reject(name, newRoot, `\`arc attest\` requires the canonical task list for \`${name}\` to be readable.`,
    "Restore the task list and close execution before attesting"); }
}

/** Read the selected work unit and refuse an open or malformed canonical task list before attestation. */
export async function readAttestInput(ports: AttestInputPorts, name: string, newRoot = false): Promise<AttestInputResult> {
  const basis = await readMetadata(ports, name, newRoot);
  if ("status" in basis) return basis;
  const lifecycle = basis.meta.state;
  if (lifecycle !== "Active" && lifecycle !== "Integrating" && !(lifecycle === "Shipped" && newRoot)) return {
    status: "rejected", reason: `\`arc attest\` requires \`${name}\` to be Active or Integrating, or Shipped with \`--new-root\`.`,
    remedy: spineRemedy("Candidate attestation runs only from an active publication lifecycle.",
      "Inspect the work-unit lifecycle state", ["arc", "status", name, "--json"]) };
  const tasks = await readTasks(ports, basis, name, newRoot);
  if ("status" in tasks) return tasks;
  const cursor = resolveTaskListCursor(tasks.taskList);
  if (cursor.status === "malformed") return reject(name, newRoot,
    `\`arc attest\` cannot use the malformed task list for \`${name}\` at line ${cursor.error.line}: ${cursor.error.message}`,
    "Repair the task-list structure and close execution before attesting",
    "Candidate attestation requires a structurally closed task list.");
  if (cursor.status === "found") return reject(name, newRoot,
    `\`arc attest\` cannot attest \`${name}\` while task remains open: Task ${cursor.cursor.leaf.id} — ${cursor.cursor.leaf.title}.`,
    "Complete the current task and work-unit verification, then attest",
    "Candidate attestation begins only after canonical task execution is closed.");
  const completed = resolveLastCompletedTask(tasks.taskList);
  return { status: "ready", ...basis, ...tasks, lifecycle,
    lastCompleted: completed.status === "found" ? `Task ${completed.item.id} — ${completed.item.title}` : null };
}
