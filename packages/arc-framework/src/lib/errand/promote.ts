/** Recoverable ordinary-v3 Errand-to-work-unit promotion composition. */

import { SlugSchema, type CanonicalDigest } from "../kernel/index.js";
import type { LocusRefusalReason, LocusMutationErrorCode } from "../locus/schema/index.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import {
  createErrandPromotionResult,
  type ErrandPromotionResult,
} from "./promotion-result.js";

/** Which wrapper floor the Errand crossed. */
export type PromoteFloor = "derivation" | "scale";

type IdentityRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface PromotionFrameReceipt {
  kind: "applied" | "idempotent";
  subject: { slug: string; claimId: string };
  generation: string;
  branch: string;
  metaPath: string;
  checkoutPath: string;
  allocation: "primary" | "spawned";
  parentCheckoutPath: string | null;
  originEntry: string | null;
  originEntrySourceDigest: CanonicalDigest | null;
  metaCommitted: boolean;
}

export type PromotionFrameResult = PromotionFrameReceipt
  | {
      kind: "confirmation-required";
      subject: { kind: "errand"; slug: string; claimId: string };
      checkoutPath: string | null;
      generation: string;
      destructiveEffect: string;
      recommendedPromptText: string;
    }
  | { kind: "refused"; reason: PromotionRefusalReason; message: string }
  | { kind: "error"; message: string };

export type PromotionRefusalReason = LocusRefusalReason | "authority-unresolved" | "generation-mismatch";

type RetirementResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface PromoteOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityRead>;
  recoverPromoted(): Promise<PromotionFrameResult | null>;
  replaceFrame(record: OrdinaryErrandRecord): Promise<PromotionFrameResult>;
  retire(record: OrdinaryErrandRecord): Promise<RetirementResult>;
  settleInbox(frame: PromotionFrameReceipt): Promise<PromotionFrameResult>;
  settleOccupancy(frame: PromotionFrameReceipt): Promise<PromotionFrameResult>;
}

export interface PromoteOrdinaryErrandOptions {
  slug: string;
  name: string;
  type: string;
  floor: PromoteFloor;
  protection: "full" | "partial";
  dependencies: PromoteOrdinaryErrandDependencies;
}

/**
 * Promote one live exact ordinary-v3 generation and settle its retained capture after the meta commit.
 *
 * @param options - Exact promotion target and identity/frame transaction boundaries
 * @returns The producer-validated prepared, settled, confirmation, refusal, or error result
 */
export async function promoteOrdinaryErrand(
  options: PromoteOrdinaryErrandOptions,
): Promise<ErrandPromotionResult> {
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
    const settled = await runFrame(
      "locus.errand-promote.occupancy",
      () => options.dependencies.settleOccupancy(recovered.frame),
    );
    if (settled === null) {
      return failure("locus.errand-promote.occupancy", "Promotion occupancy settlement returned no result.");
    }
    return "result" in settled ? settled.result : success(slug, settled.frame);
  }
  if (!isOrdinary(read.record) || read.record.slug !== slug || read.record.state !== "open") {
    return refusal("promotion-source-invalid", `Identity '${slug}' is not a live ordinary v3 Errand.`);
  }
  const record = read.record;
  const replaced = await runFrame("locus.errand-promote.frame", () => options.dependencies.replaceFrame(record));
  if (replaced === null) return failure("locus.errand-promote.frame", "Promotion frame returned no result.");
  if ("result" in replaced) return replaced.result;

  const settled = await settleCommittedFrame(options.dependencies, replaced.frame);
  if ("result" in settled) return settled.result;
  if (!settled.frame.metaCommitted) return success(slug, settled.frame);

  let retired: RetirementResult;
  try {
    retired = await options.dependencies.retire(record);
  } catch (error) {
    return failure("locus.errand-promote.identity", message(error));
  }
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  if (retired.kind === "error") return failure("locus.errand-promote.identity", retired.message);
  const frame: PromotionFrameReceipt = {
    ...settled.frame,
    kind: settled.frame.kind === "applied" || retired.kind === "applied" ? "applied" : "idempotent",
  };
  const occupied = await runFrame(
    "locus.errand-promote.occupancy",
    () => options.dependencies.settleOccupancy(frame),
  );
  if (occupied === null) {
    return failure("locus.errand-promote.occupancy", "Promotion occupancy settlement returned no result.");
  }
  return "result" in occupied ? occupied.result : success(slug, occupied.frame);
}

async function settleCommittedFrame(
  dependencies: PromoteOrdinaryErrandDependencies,
  frame: PromotionFrameReceipt,
): Promise<{ frame: PromotionFrameReceipt } | { result: ErrandPromotionResult }> {
  if (!frame.metaCommitted) return { frame };
  const settled = await runFrame(
    "locus.errand-promote.inbox",
    () => dependencies.settleInbox(frame),
  );
  if (settled === null) {
    return { result: failure("locus.errand-promote.inbox", "Promotion capture settlement returned no result.") };
  }
  return settled;
}

async function runFrame(
  code: LocusMutationErrorCode,
  operation: () => Promise<PromotionFrameResult | null>,
): Promise<{ frame: PromotionFrameReceipt } | { result: ErrandPromotionResult } | null> {
  let frame: PromotionFrameResult | null;
  try {
    frame = await operation();
  } catch (error) {
    return { result: failure(code, message(error)) };
  }
  if (frame === null) return null;
  if (frame.kind === "confirmation-required") {
    return {
      result: createErrandPromotionResult({
        outcome: "confirmation-required",
        operation: "errand-promote",
        subject: frame.subject,
        checkoutPath: frame.checkoutPath,
        generation: frame.generation,
        destructiveEffect: frame.destructiveEffect,
        recommendedPromptText: frame.recommendedPromptText,
      }),
    };
  }
  if (frame.kind === "refused") return { result: refusal(frame.reason, frame.message) };
  if (frame.kind === "error") return { result: failure(code, frame.message) };
  return { frame };
}

function success(
  slug: string,
  frame: PromotionFrameReceipt,
): ErrandPromotionResult {
  return createErrandPromotionResult({
    outcome: frame.kind,
    operation: "errand-promote",
    subject: { kind: "errand", slug: frame.subject.slug, claimId: frame.subject.claimId },
    generation: frame.generation,
    branch: frame.branch,
    metaPath: frame.metaPath,
    checkoutPath: frame.checkoutPath,
    allocation: frame.allocation,
    parentCheckoutPath: frame.parentCheckoutPath,
    settlement: frame.metaCommitted
      ? {
          state: "settled",
          identity: "retired",
          originEntry: null,
          originEntrySourceDigest: null,
        }
      : {
          state: "commit-required",
          identity: "retained",
          originEntry: frame.originEntry,
          originEntrySourceDigest: frame.originEntrySourceDigest,
        },
    recommendedPromptText: frame.metaCommitted
      ? `Promoted Errand '${slug}' to '${frame.branch}' and settled its exact originating generation.`
      : `Commit '${frame.metaPath}', then rerun this exact promotion to settle the originating Errand generation.`,
  });
}

function isOrdinary(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.kind === "errand" && record.purpose === "errand";
}

function refusal(reason: PromotionRefusalReason, text: string): ErrandPromotionResult {
  return createErrandPromotionResult({
    outcome: "refused",
    operation: "errand-promote",
    subject: null,
    checkoutPath: null,
    generation: null,
    reason,
    recommendedPromptText: text,
  });
}

function failure(code: LocusMutationErrorCode, text: string): ErrandPromotionResult {
  return createErrandPromotionResult({
    outcome: "error",
    operation: "errand-promote",
    subject: null,
    checkoutPath: null,
    generation: null,
    error: { code, message: text || "Errand promotion failed" },
    recommendedPromptText: "Inspect the retained Errand identity and local frame evidence before retrying.",
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
