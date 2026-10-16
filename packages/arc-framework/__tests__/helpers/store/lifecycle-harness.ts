/** Lifecycle verb harness over the reference store's production semantic checks. */
import { renderMetaFile, type MetaRenderOverrides } from "../../../src/lib/store/kinds/meta/writers.js";
import { createKindRegistry } from "../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { BatchInputSchema, WriteInputSchema, OwnerIdentitySchema, recordReferences,
  type StoreResult, type StoreRecord, type WriteInput, type WriteResult, type BatchInput, type BatchResult,
  type Links, type WritePlacement, type RecordReference } from "../../../src/lib/store/index.js";
import { ReferenceBackend } from "./reference-backend.js";

/** Checked operational envelopes enter the backend before any records can change. */
export class LifecycleReferenceBackend extends ReferenceBackend {
  constructor() { super({ registry: createKindRegistry(PRODUCTION_REGISTRATIONS) }); }
  override write(input: WriteInput): Promise<StoreResult<WriteResult>> {
    return super.write(WriteInputSchema.parse(input));
  }
  override batch(input: BatchInput): Promise<StoreResult<BatchResult>> {
    return super.batch(BatchInputSchema.parse(input));
  }
}
/** Unwrap a harness operation with the refusal intact in its diagnostic.
 * @param result - Store operation result.
 * @returns Successful payload.
 */
export function lifecycleSuccess<T>(result: StoreResult<T>): T {
  if (result.status === "refused") throw new Error(`${result.refusal.code}: ${result.refusal.condition} ${result.refusal.remedy.text}`);
  return result.result;
}
/** Build a checked store and seed through the same checks its verbs exercise.
 * @returns Store plus metadata and arbitrary-record seed helpers.
 */
export function createLifecycleHarness() {
  const store = new LifecycleReferenceBackend();
  const seed = async (reference: RecordReference, content: string, placement?: WritePlacement, links?: Links): Promise<StoreRecord> => {
    const write = lifecycleSuccess(await store.write({ action: "put", reference, expected: null, content,
      ...(placement === undefined ? {} : { placement }), ...(links === undefined ? {} : { links }),
      provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
    return lifecycleSuccess(await store.read({ reference: write.reference }));
  };
  return { store, seed,
    seedMeta: async (slug: string, fields: MetaRenderOverrides = {}, placement: WritePlacement = { kind: "active" }, links?: Links) => {
      const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
      return seed(recordReferences["work-item/meta"](owner), renderMetaFile(slug,
        { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop", ...fields }), placement, links);
    },
  };
}
