/** Prepare a target checkout's projected edit without acquiring mutation authority. */
import { readCheckoutLayoutContext } from "../checkout-layout.js";
import { checkSerializationRules } from "../serialization.js";
import type { StoreRefusal } from "../refusal.js";
import { prepareWriteBack, type PreparedWriteBack, type WriteBackContext } from "./write-back.js";
import { prepareIndexedProjectionSubmission, type PreparedProjectionSubmission } from "./submission.js";
import type { TakeInRead, TakeInRequest } from "./take-in-port.js";
import type { RefusedMark } from "./index-schema.js";
import type { ProjectionRootBindingInput } from "./engine-binding.js";
import { createProjectionLocalCapture } from "./engine-capture.js";
import { readProjectionActor } from "./engine-actor.js";
import { bindProjectionRights } from "./rights-binding.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { interpretProjectionView } from "./view-settings.js";
import type { ProjectionSelectionContext } from "./selection-context.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";

/** A provisional preparation proves no write landed and grants no right to replace a file. */
export type ProjectionFeasibility = Exclude<PreparedWriteBack, { kind: "ready" }>
  | { readonly kind: "ready"; readonly submission: PreparedProjectionSubmission; readonly read: TakeInRead }
  | { readonly kind: "refused"; readonly mark: RefusedMark; readonly refusal?: StoreRefusal; readonly nativeRefusal?: true };

/** A read-only target binding, deliberately distinct from roots that collect real replacements. */
export interface ReadOnlyProjectionRoot extends ProjectionSelectionContext {
  readonly ports: Pick<ProjectionEnginePorts, "exec">;
  readonly context: WriteBackContext;
  readonly view: ReturnType<typeof interpretProjectionView>["view"];
  readonly takeIn: (request: TakeInRequest) => Promise<ProjectionFeasibility>;
}

/** Read the target's layout and actor without a lock, process registration, or machine-ID creation. */
export async function bindReadOnlyProjectionRoot(input: Omit<ProjectionRootBindingInput,
  "actor" | "session" | "register" | "mint" | "unsent" | "links">): Promise<ReadOnlyProjectionRoot> {
  const { configuration: config, ports, location } = input;
  if (config.identity.status !== "identified") throw new Error("A projection root needs an identity");
  const layout = await readCheckoutLayoutContext(input.checkout, { fresh: true });
  const context: WriteBackContext = { store: input.store, location, format: config.objectFormat,
    actor: await readProjectionActor(ports, location, config.identity.identity), memo: input.history,
    registry: ports.registry, verb: input.mode ?? "write-back", captureLocal: createProjectionLocalCapture(input) };
  const rights = bindProjectionRights(input.store, config.identity.identity, ports.exec, input.mode ?? "write-back");
  return { checkout: input.checkout, ...layout, context, store: input.store, identity: config.identity.identity, ports: { exec: ports.exec },
    view: interpretProjectionView(config.view).view,
    takeIn: async request => {
      const denied = await rights(request);
      return denied === null ? prepareProjectionFeasibility(context, request) : { kind: "refused", mark: denied };
    } };
}

/** Run the normal read and sealed preparation, stopping before submission or local persistence. */
export async function prepareProjectionFeasibility(context: WriteBackContext, request: TakeInRequest): Promise<ProjectionFeasibility> {
  const prepared = await prepareWriteBack(context, request);
  if (prepared.kind !== "ready") return prepared;
  const refusal = checkSerializationRules(request.entry.reference, prepared.write.content);
  if (refusal !== undefined) return { kind: "refused", refusal, mark: markStoreRefusal(refusal, context.verb) };
  const submission = await prepareIndexedProjectionSubmission(context, request, prepared);
  return submission.status === "ok" ? { kind: "ready", submission: submission.result, read: prepared.read }
    : { kind: "refused", refusal: submission.refusal, mark: markStoreRefusal(submission.refusal, context.verb),
      ...(submission.nativeRefusal === true ? { nativeRefusal: true as const } : {}) };
}
