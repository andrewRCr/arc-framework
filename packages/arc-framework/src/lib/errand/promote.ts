/** Recoverable ordinary-v3 Errand-to-work-unit promotion composition. */

import { SlugSchema, type CanonicalDigest } from "../kernel/index.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import type { LocusMutationResultV1, LocusRefusalReason,
  LocusMutationErrorCode } from "../locus/schema/index.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";

/** Which wrapper floor the Errand crossed. */
export type PromoteFloor = "derivation" | "scale";

type IdentityRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface PromotionFrameReceipt {
  kind: "applied" | "idempotent";
  branch: string;
  metaPath: string;
  recordId: string;
  leaseId: string;
  checkoutPath: string;
  allocation: "primary" | "spawned";
  parentReleased: boolean;
  originEntry: string | null;
  originEntrySourceDigest: CanonicalDigest | null;
  metaCommitted: boolean;
}

export type PromotionFrameResult = PromotionFrameReceipt
  | { kind: "refused"; reason: LocusRefusalReason; message: string }
  | { kind: "error"; message: string };

type RetirementResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface PromoteOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityRead>;
  recoverPromoted(): Promise<PromotionFrameResult | null>;
  replaceFrame(record: OrdinaryErrandRecord): Promise<PromotionFrameResult>;
  retire(record: OrdinaryErrandRecord): Promise<RetirementResult>;
  settlePromoted(frame: PromotionFrameReceipt): Promise<PromotionFrameResult>;
}

export interface PromoteOrdinaryErrandOptions {
  slug: string;
  name: string;
  type: string;
  floor: PromoteFloor;
  protection: "full" | "partial";
  dependencies: PromoteOrdinaryErrandDependencies;
}

/** Promote one live exact ordinary-v3 generation and settle its retained capture after the meta commit. */
export async function promoteOrdinaryErrand(
  options: PromoteOrdinaryErrandOptions,
): Promise<LocusMutationResultV1> {
  if (options.protection !== "full") {
    return refusal("full-protection-required", "Errand promotion requires full branch protection.");
  }
  const slug = options.slug.trim();
  const name = options.name.trim();
  const type = options.type.trim();
  if (slug === "" || name === "" || type === "") {
    return refusal("promotion-source-invalid", "Promotion slug, name, and branch type must be non-empty.");
  }
  if (!SlugSchema.safeParse(name).success || name === "." || name === ".." || /[\\/]/u.test(name)) {
    return refusal("promotion-source-invalid", "The requested work-unit name is invalid.");
  }

  let read: IdentityRead;
  try {
    read = await options.dependencies.readIdentity();
  } catch (error) {
    return failure("locus.errand-promote.identity-read", message(error));
  }
  if (read.kind === "refused") return refusal("identity-conflict", read.reason);
  if (read.kind === "error") return failure("locus.errand-promote.identity-read", read.message);
  if (read.record === null) {
    const recovered = await runFrame("locus.errand-promote.recover", () => options.dependencies.recoverPromoted());
    if (recovered === null) {
      return refusal("promotion-source-invalid", `No exact Errand or promoted work-unit generation exists for '${slug}'.`);
    }
    if ("result" in recovered) return recovered.result;
    const settled = await settleCommittedFrame(options.dependencies, recovered.frame);
    return "result" in settled ? settled.result : success(slug, settled.frame);
  }
  if (!isOrdinary(read.record) || read.record.slug !== slug || read.record.state !== "open") {
    return refusal("promotion-source-invalid", `Identity '${slug}' is not a live ordinary v3 Errand.`);
  }
  const record = read.record;
  const replaced = await runFrame("locus.errand-promote.frame", () => options.dependencies.replaceFrame(record));
  if (replaced === null) return failure("locus.errand-promote.frame", "Promotion frame returned no result.");
  if ("result" in replaced) return replaced.result;

  let retired: RetirementResult;
  try {
    retired = await options.dependencies.retire(record);
  } catch (error) {
    return failure("locus.errand-promote.identity", message(error));
  }
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  if (retired.kind === "error") return failure("locus.errand-promote.identity", retired.message);
  const frame: PromotionFrameReceipt = {
    ...replaced.frame,
    kind: replaced.frame.kind === "applied" || retired.kind === "applied" ? "applied" : "idempotent",
  };
  const settled = await settleCommittedFrame(options.dependencies, frame);
  return "result" in settled ? settled.result : success(slug, settled.frame);
}

async function settleCommittedFrame(
  dependencies: PromoteOrdinaryErrandDependencies,
  frame: PromotionFrameReceipt,
): Promise<{ frame: PromotionFrameReceipt } | { result: LocusMutationResultV1 }> {
  if (!frame.metaCommitted || frame.originEntry === null) return { frame };
  const settled = await runFrame(
    "locus.errand-promote.inbox",
    () => dependencies.settlePromoted(frame),
  );
  if (settled === null) {
    return { result: failure("locus.errand-promote.inbox", "Promotion capture settlement returned no result.") };
  }
  return settled;
}

async function runFrame(
  code: LocusMutationErrorCode,
  operation: () => Promise<PromotionFrameResult | null>,
): Promise<{ frame: PromotionFrameReceipt } | { result: LocusMutationResultV1 } | null> {
  let frame: PromotionFrameResult | null;
  try {
    frame = await operation();
  } catch (error) {
    return { result: failure(code, message(error)) };
  }
  if (frame === null) return null;
  if (frame.kind === "refused") return { result: refusal(frame.reason, frame.message) };
  if (frame.kind === "error") return { result: failure(code, frame.message) };
  return { frame };
}

function success(
  slug: string,
  frame: PromotionFrameReceipt,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: frame.kind,
    operation: "errand-promote",
    allocation: { kind: frame.allocation, checkoutPath: frame.checkoutPath },
    recordId: frame.recordId,
    leaseId: frame.leaseId,
    activeLocusPath: frame.checkoutPath,
    sessionHomePath: frame.checkoutPath,
    identity: null,
    originEntry: frame.originEntry,
    originEntrySourceDigest: frame.originEntrySourceDigest,
    restoredParent: null,
    nextOffer: null,
    recommendedPromptText: `Promoted Errand '${slug}' to '${frame.branch}' and made its checkout the work-unit session home.`,
  });
}

function isOrdinary(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.version === 3 && record.kind === "errand" && record.purpose === "errand";
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "errand-promote", reason, recommendedPromptText: text });
}

function failure(code: LocusMutationErrorCode, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation: "errand-promote",
    error: { code, message: text || "Errand promotion failed" },
    recommendedPromptText: "Inspect the retained Errand identity and local frame evidence before retrying.",
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
