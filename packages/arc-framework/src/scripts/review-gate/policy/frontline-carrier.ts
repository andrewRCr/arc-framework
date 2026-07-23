/** Effect-free preparation boundary for agent and command frontline carriers. */

import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "./frontline-source.js";

export const FRONTLINE_AUTHORIZATION_OFFER =
  "Authorize the selected agent carrier for this one frontline review, or skip the offered review.";

export type FrontlineCarrierExecution<Result = unknown> = () => Promise<Result>;
export type FrontlineAdapterPreparation<Result = unknown> =
  | { status: "ready"; execute: FrontlineCarrierExecution<Result> }
  | { status: "needs-authorization" }
  | { status: "unavailable" | "invalid"; reason: string };

export type FrontlineCarrierPreparation<Result = unknown> =
  | {
    status: "ready";
    sourceId: string;
    kind: FrontlineSourceDescriptor["kind"];
    execute: FrontlineCarrierExecution<Result>;
  }
  | { status: "needs-authorization"; sourceId: string; offerText: string }
  | { status: "unavailable" | "invalid"; sourceId: string; reason: string };

export interface FrontlineCarrierAdapters<Result = unknown> {
  prepareAgent(input: { handle: { capabilityId: string } }): Promise<FrontlineAdapterPreparation<Result>>;
  prepareCommand(input: {
    executable: string;
    argv: readonly string[];
  }): Promise<FrontlineAdapterPreparation<Result>>;
}

export type FrontlineCarrierFailureClass =
  | "transient-unavailable"
  | "capability-unsupported"
  | "invalid-output"
  | "authorization-rejected";

/** Map a non-ready carrier preparation to the closed public failure vocabulary. */
export function classifyFrontlineCarrierFailure(
  prepared: Exclude<FrontlineCarrierPreparation, { status: "ready" }>,
): FrontlineCarrierFailureClass {
  if (prepared.status === "needs-authorization") return "authorization-rejected";
  if (prepared.reason.startsWith("unsupported-")) return "capability-unsupported";
  return prepared.status === "invalid" ? "invalid-output" : "transient-unavailable";
}

function normalizePreparation<Result>(
  source: FrontlineSourceDescriptor,
  prepared: FrontlineAdapterPreparation<Result>,
): FrontlineCarrierPreparation<Result> {
  if (prepared.status === "ready") {
    if (typeof prepared.execute !== "function") {
      return { status: "invalid", sourceId: source.sourceId, reason: "malformed-adapter-result" };
    }
    return { status: "ready", sourceId: source.sourceId, kind: source.kind, execute: prepared.execute };
  }
  if (prepared.status === "needs-authorization") {
    return {
      status: "needs-authorization",
      sourceId: source.sourceId,
      offerText: FRONTLINE_AUTHORIZATION_OFFER,
    };
  }
  return { status: prepared.status, sourceId: source.sourceId, reason: prepared.reason };
}

/**
 * Prepare a validated carrier without invoking its returned execution capability.
 *
 * @param sourceInput - Registered agent handle or direct executable-plus-argv descriptor.
 * @param adapters - Harness-owned preparation adapters.
 * @returns A typed preparation result; only `ready` contains an execution capability.
 */
export async function prepareFrontlineCarrier<Result = unknown>(
  sourceInput: unknown,
  adapters: FrontlineCarrierAdapters<Result>,
): Promise<FrontlineCarrierPreparation<Result>> {
  const parsed = FrontlineSourceDescriptorSchema.safeParse(sourceInput);
  if (!parsed.success) {
    return { status: "invalid", sourceId: "invalid", reason: "invalid-source-descriptor" };
  }
  const source = parsed.data;
  try {
    const prepared = source.kind === "agent"
      ? await adapters.prepareAgent({ handle: source.handle })
      : await adapters.prepareCommand({ executable: source.executable, argv: source.argv });
    return normalizePreparation(source, prepared);
  } catch {
    return { status: "unavailable", sourceId: source.sourceId, reason: "adapter-unavailable" };
  }
}
