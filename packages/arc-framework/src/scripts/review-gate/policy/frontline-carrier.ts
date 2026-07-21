/** Effect-free preparation boundary for agent and command frontline carriers. */

import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "./frontline-source.js";

export const FRONTLINE_AUTHORIZATION_OFFER =
  "Authorize the selected agent carrier for this one frontline review, or skip the offered review.";

export type FrontlineCarrierExecution = () => Promise<unknown>;
export type FrontlineAdapterPreparation =
  | { status: "ready"; execute: FrontlineCarrierExecution }
  | { status: "needs-authorization" }
  | { status: "unavailable" | "invalid"; reason: string };

export type FrontlineCarrierPreparation =
  | {
    status: "ready";
    sourceId: string;
    kind: FrontlineSourceDescriptor["kind"];
    execute: FrontlineCarrierExecution;
  }
  | { status: "needs-authorization"; sourceId: string; offerText: string }
  | { status: "unavailable" | "invalid"; sourceId: string; reason: string };

export interface FrontlineCarrierAdapters {
  prepareAgent(input: { handle: { capabilityId: string } }): Promise<FrontlineAdapterPreparation>;
  prepareCommand(input: {
    executable: string;
    argv: readonly string[];
  }): Promise<FrontlineAdapterPreparation>;
}

function normalizePreparation(
  source: FrontlineSourceDescriptor,
  prepared: FrontlineAdapterPreparation,
): FrontlineCarrierPreparation {
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
export async function prepareFrontlineCarrier(
  sourceInput: unknown,
  adapters: FrontlineCarrierAdapters,
): Promise<FrontlineCarrierPreparation> {
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
