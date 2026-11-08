/** Build stable local capsules and submit one prepared edit through atomic batch admission. */
import { basename, dirname, join } from "node:path";
import type { BatchInput, WriteResult } from "../write.js";
import { ProjectionAdmissionSchema, type ProjectionAdmission } from "../projection-admission.js";
import { createKindRegistry } from "../registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { StoreResult } from "../refusal.js";
import { isManagedPath } from "../../kernel/index.js";
import { RecordEntrySchema, type ProjectionIndex, type RecordEntry } from "./index-schema.js";
import { captureProjectionLocal, type ProjectionLocalCapture } from "./local-capture.js";
import { planProjectionWrite, type ProjectionWritePlan } from "./admission-planner.js";
import type { ProjectionPreparationRequest } from "./admission-selection.js";
import type { PreparedWriteBack, WriteBackContext, CapturedWriteBackFile } from "./write-back.js";
import type { TakeInRequest } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { readRetainedBase, TAKEN_IN_FOLDER, RetainedBaseUnavailable } from "./taken-in.js";
import { gateRead } from "./read-gate.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { projectionAdmissionConflict } from "./preparation-view.js";
import { sameReference } from "../identity.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
/** The one submitted batch and the basis to retain if it is accepted. */
export interface PreparedProjectionSubmission { readonly batch: BatchInput; readonly plan: ProjectionWritePlan }

/** Preserve a local ready edit while deriving its actual mutation and evidence afresh. */
export async function prepareIndexedProjectionSubmission(context: WriteBackContext, request: TakeInRequest,
  prepared: Extract<PreparedWriteBack, { kind: "ready" }>): Promise<StoreResult<PreparedProjectionSubmission>> {
  const copies = await captureRetainedBases(context, request.entry);
  if (copies.status === "refused") return copies;
  return prepareStable(context, request.checkout, request.path, request.copy === null ? "file" : "aside", {
    selection: { kind: "indexed", reference: request.entry.reference }, input: {
      format: context.format, file: fileInput(prepared.captured), basis: basisInput(request.entry), base: request.base,
      rendering: request.rendering ?? null, resolution: request.resolution ?? null,
      recoveringBase: context.recoveringBase ?? false, retainedBases: copies.result } });
}

/** Prepare new content without granting authority to the earlier discovered target. */
export function prepareAdoptedProjectionSubmission(context: WriteBackContext, checkout: string, path: string,
  file: ProjectionAdmission["input"]["file"], index: ProjectionIndex): Promise<StoreResult<PreparedProjectionSubmission>> {
  return prepareStable(context, checkout, path, "file", { selection: { kind: "unindexed" }, input: {
    format: context.format, file, basis: null, base: null, rendering: null, resolution: null, recoveringBase: false, retainedBases: [] } }, index);
}

async function prepareStable(context: WriteBackContext, checkout: string, path: string, source: "file" | "aside",
  data: Pick<ProjectionPreparationRequest, "selection" | "input">, index?: ProjectionIndex): Promise<StoreResult<PreparedProjectionSubmission>> {
  const capture = () => context.captureLocal?.(path, source) ?? captureProjectionLocal({ checkout, path, source, location: context.location, index });
  let local = await capture();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (local.status === "refused") return local;
    if (data.selection.kind === "indexed" && (local.result.binding === null || !sameReference(local.result.binding, data.selection.reference))) {
      return { status: "refused", refusal: projectionAdmissionConflict(data.selection.reference,
        "The local index no longer binds this path to the prepared record. Re-read its current projection basis.") };
    }
    const request: ProjectionPreparationRequest = { version: 1, mutationIndex: 0, ...data,
      editingIdentity: local.result.identity, local: local.result.local };
    const plan = await planProjectionWrite(context.store, request, context.registry ?? registry);
    if (plan.status === "refused") return plan;
    const observed = await capture();
    if (observed.status === "refused") return observed;
    if (sameLocal(local.result, observed.result)) {
      const projectionAdmission = ProjectionAdmissionSchema.parse({ ...request, prepared: plan.result.prepared });
      return { status: "ok", result: { plan: plan.result, batch: { writes: [plan.result.mutation],
        provenance: { verb: context.verb ?? "write-back", lifecycleAction: "edit" },
        observations: plan.result.observations, projectionAdmission } } };
    }
    local = observed;
  }
  const reference = data.selection.kind === "indexed" ? data.selection.reference : undefined;
  if (reference) return { status: "refused", refusal: projectionAdmissionConflict(reference, "Local ownership or layout evidence changed repeatedly during preparation.") };
  return localFailure("Local adoption evidence changed repeatedly during preparation.");
}

/** Submit a sealed single-write batch and preserve the existing single-result continuation. */
export async function submitProjectionBatch(context: WriteBackContext, input: BatchInput): Promise<StoreResult<WriteResult>> {
  const result = await context.store.batch(input);
  if (result.status === "refused") return result;
  const only = result.result.writes[0];
  if (!only || result.result.writes.length !== 1) throw new Error("A prepared content batch must return its one write result");
  context.onWrite?.();
  await context.checkpoint?.();
  return { status: "ok", result: only };
}

function sameLocal(left: ProjectionLocalCapture, right: ProjectionLocalCapture): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fileInput(captured: CapturedWriteBackFile): ProjectionAdmission["input"]["file"] {
  return { content: captured.content, stamp: captured.stamp, mtimeNs: captured.read.stat.mtimeNs.toString() };
}

function basisInput(entry: RecordEntry): NonNullable<ProjectionAdmission["input"]["basis"]> {
  const encoded = RecordEntrySchema.encode(entry);
  return ProjectionAdmissionSchema.shape.input.shape.basis.unwrap().parse({ reference: encoded.reference, written: encoded.written, base: encoded.base, markers: encoded.markers,
    notices: encoded.notices, unshown: encoded.unshown, persisted: encoded.persisted, inProgress: encoded.inProgress,
    copies: encoded.copies, adoption: encoded.adoption ?? null });
}

async function captureRetainedBases(context: WriteBackContext, entry: RecordEntry): Promise<StoreResult<ProjectionAdmission["input"]["retainedBases"]>> {
  const kept = entry.persisted?.takenIn;
  if (kept?.kind !== "copy") return { status: "ok", result: [] };
  if (!isManagedPath(kept.name)) return localFailure("The retained input has an unsafe local copy name.");
  const path = `${basename(context.location.stateDir)}/${TAKEN_IN_FOLDER}/${kept.name}`;
  const boundary = await readProjectionLinkBoundary(dirname(context.location.stateDir), [path]);
  if (boundary(path) !== null) return localFailure("The retained input path traverses a symbolic link.");
  const gate = await gateRead({ path: join(context.location.stateDir, TAKEN_IN_FOLDER, kept.name), markdown: false });
  if (gate.kind !== "read") return localFailure("The retained input is unavailable or has not settled.");
  try {
    const content = await readRetainedBase(context.location, kept.name);
    return gitBlobId(content, context.format) === kept.blob ? { status: "ok", result: [{ name: kept.name, content }] }
      : localFailure("The retained input differs from its recorded content blob.");
  } catch (error) {
    if (!(error instanceof RetainedBaseUnavailable)) throw error;
    return localFailure(error.message);
  }
}

function localFailure(condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "projection.local", condition,
    remedy: { text: "Restore the retained local evidence and prepare the unchanged file again." } } };
}
