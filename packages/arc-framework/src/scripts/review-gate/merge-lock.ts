/**
 * Merge-lock verb contracts — how a pull request should open, and whether a
 * hold or release applies to a live one.
 *
 * @module
 */

import { z } from "zod";

import {
  MergeLockResolveEnvelopeSchema,
  type MergeLockResolveEnvelope,
} from "./core/merge-lock-command-envelope.js";
import {
  ReviewTargetSchema,
  ReviewTreeRootSchema,
  ReviewVehicleSchema,
} from "./readiness.js";

/**
 * Input to the pre-open query. No pull request exists yet, so the request
 * carries the candidate tree alone — the opening disposition is the same for
 * every lane and vehicle kind.
 */
export const MergeLockResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
}).readonly();
export type MergeLockResolveRequest = z.infer<typeof MergeLockResolveRequestSchema>;

/**
 * Input to `hold` and `release`. Both act on a live pull request behind the
 * exact-head preflight, and the vehicle is what the readiness evaluation
 * consumes, so the two verbs take one shape.
 */
export const MergeLockTransitionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type MergeLockTransitionRequest = z.infer<typeof MergeLockTransitionRequestSchema>;

/**
 * What the configured `merge.lock` key was found to be. The shared settings
 * reader cannot express this: it degrades an unreadable file to a warning and
 * substitutes the default, so a missing key and a missing file arrive
 * indistinguishable. The lock has to tell them apart — one is the documented
 * default, the other silently disables the control.
 */
export type MergeLockSetting =
  | { state: "absent" }
  | { state: "value"; value: string }
  | { state: "unreadable" };

/** Config, GitHub, and readiness boundaries used by the merge-lock verbs. */
export interface MergeLockPort {
  readMergeLock(treeRoot: string): Promise<MergeLockSetting>;
}

type LockMode = "draft" | "none" | "unresolved";

/**
 * Resolve the key strictly. Absent is the documented `none` default; anything
 * unreadable or outside the domain fails closed rather than resolving to the
 * value that turns the control off.
 */
function lockMode(setting: MergeLockSetting): LockMode {
  if (setting.state === "unreadable") return "unresolved";
  if (setting.state === "absent") return "none";
  if (setting.value === "draft") return "draft";
  return setting.value === "none" ? "none" : "unresolved";
}

async function readLockMode(port: Pick<MergeLockPort, "readMergeLock">, treeRoot: string): Promise<LockMode> {
  try {
    return lockMode(await port.readMergeLock(treeRoot));
  } catch {
    return "unresolved";
  }
}

const CONFIG_UNRESOLVED_MESSAGE = "The merge.lock setting could not be resolved to a supported value.";

/**
 * Answer how a pull request about to be opened should be opened.
 *
 * @param input - Candidate tree root.
 * @param port - Config boundary resolved against that root.
 * @returns A strict locked, none, or blocked envelope.
 */
export async function resolveMergeLock(
  input: MergeLockResolveRequest,
  port: Pick<MergeLockPort, "readMergeLock">,
): Promise<MergeLockResolveEnvelope> {
  const request = MergeLockResolveRequestSchema.parse(input);
  const mode = await readLockMode(port, request.treeRoot);
  const base = { schemaVersion: 1 as const, mode: "merge-lock-resolve" as const };
  if (mode === "unresolved") {
    return MergeLockResolveEnvelopeSchema.parse({
      ...base,
      diagnostics: [{ code: "config-unresolved", message: CONFIG_UNRESOLVED_MESSAGE }],
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    });
  }
  return MergeLockResolveEnvelopeSchema.parse({
    ...base,
    diagnostics: [],
    ...(mode === "draft"
      ? { state: "locked", nextAction: "open-locked" }
      : { state: "none", nextAction: "open-plain" }),
    payload: {},
  });
}
