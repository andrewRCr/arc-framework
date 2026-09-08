/** Read and revalidate one completed v3 cut map before result planning. */

import { canonicalize } from "../canonical/canonical-json.js";
import {
  decodeV3DecomposeCutMap,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";
import {
  revalidateV3DecomposeCutMapBinding,
  type V3DecomposePreflight,
  type V3DecomposePreflightMismatch,
} from "./decompose-v3-preflight.js";

export type V3DecomposeExecutionPreflightMismatch =
  | "completed-map"
  | "unexpected-error"
  | V3DecomposePreflightMismatch
  | `git-preflight:${string}`;

export interface V3DecomposeExecutionPreflightDependencies {
  readCutMap(path: string): Promise<Uint8Array>;
  resolvePreflight(origin: string): Promise<
    | { status: "ready"; preflight: V3DecomposePreflight }
    | {
      status: "rejected";
      reason: Exclude<V3DecomposeExecutionPreflightMismatch, "completed-map">;
      locus?: string;
    }
  >;
}

export type V3DecomposeExecutionPreflightResult =
  | {
    status: "current";
    completedMap: V3DecomposeCutMap;
    preflight: V3DecomposePreflight;
  }
  | {
    status: "stale";
    reason: V3DecomposeExecutionPreflightMismatch;
    locus: string;
  };

function decodeCanonicalMap(
  bytes: Uint8Array,
  cutMapPath: string,
): { map: V3DecomposeCutMap } | { locus: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    const decoded = decodeV3DecomposeCutMap(parsed);
    if (decoded.status === "rejected") return { locus: decoded.issue.path };
    return text === `${canonicalize(decoded.value)}\n`
      ? { map: decoded.value }
      : { locus: cutMapPath };
  } catch {
    return { locus: cutMapPath };
  }
}

/**
 * Read map bytes once, resolve the current committed source, and compare every
 * machine binding before returning either operand to result planning.
 */
export async function revalidateV3DecomposeExecutionPreflight(
  deps: V3DecomposeExecutionPreflightDependencies,
  origin: string,
  cutMapPath: string,
): Promise<V3DecomposeExecutionPreflightResult> {
  let bytes: Uint8Array;
  try {
    bytes = await deps.readCutMap(cutMapPath);
  } catch {
    return { status: "stale", reason: "completed-map", locus: cutMapPath };
  }
  const decoded = decodeCanonicalMap(bytes, cutMapPath);
  if ("locus" in decoded) {
    return { status: "stale", reason: "completed-map", locus: decoded.locus };
  }
  const completedMap = decoded.map;
  if (completedMap.machine.source.origin !== origin) {
    return { status: "stale", reason: "completed-map", locus: "machine.source.origin" };
  }

  const refreshed = await deps.resolvePreflight(origin);
  if (refreshed.status === "rejected") {
    return {
      status: "stale",
      reason: refreshed.reason,
      locus: refreshed.locus !== undefined
        ? refreshed.locus
        : "machine.source",
    };
  }
  const binding = revalidateV3DecomposeCutMapBinding(completedMap, refreshed.preflight);
  if (binding.status === "stale") return binding;
  return {
    status: "current",
    completedMap,
    preflight: binding.preflight,
  };
}
