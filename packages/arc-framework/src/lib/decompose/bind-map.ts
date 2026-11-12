/** Completed-map admission against fresh store-backed preflight facts. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import { decodeCutMap } from "./cut-map-decode.js";
import { prepareDecomposePreflight } from "./preflight.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";

export type DecomposeAdditiveMode = "execute" | "extract";

/** A decoded map and the fresh records to which its machine is bound. */
export interface BoundDecomposeMap {
  map: CutMap;
  acquired: DecomposeOriginRecords;
}

/** Validate a completed map before deriving any writes. */
export async function bindDecomposeMap(ctx: DecomposeContext, origin: string, mode: DecomposeAdditiveMode,
  input: DecomposeMapInput): Promise<DecomposeResult<BoundDecomposeMap>> {
  const decoded = decodeCutMap(input.cutMap);
  if (decoded.status === "rejected") {
    const { issue } = decoded;
    const argv = ["arc", "decompose", origin, "--preflight"];
    return { status: "refused", reason: issue.code, class: "recoverable", locus: issue.path || "$", message: issue.message,
      remedy: issue.code === "unsupported-version"
        ? { text: `Generate a version-4 starter with ${renderV3DecomposeArgv(argv)}.`, argv }
        : { text: `Complete or correct ${JSON.stringify(input.cutMapPath)} at ${issue.path || "$"}, then retry ${renderV3DecomposeArgv(["arc", "decompose", origin, `--${mode}`, input.cutMapPath])}.` } };
  }
  const fresh = await prepareDecomposePreflight(ctx, origin);
  if (fresh.status === "refused") return fresh;
  if (canonicalize(decoded.value.machine) !== canonicalize(fresh.result.machine)) {
    const argv = ["arc", "decompose", origin, "--preflight"];
    return { status: "refused", reason: "stale-machine", class: "recoverable", locus: "machine",
      remedy: { text: `Generate a fresh starter with ${renderV3DecomposeArgv(argv)}, then complete its authoring decisions.`, argv } };
  }
  const correctMode = decoded.value.authoring.shape === "extraction" ? "extract" : "execute";
  if (correctMode !== mode) {
    const argv = ["arc", "decompose", origin, `--${correctMode}`, input.cutMapPath];
    return { status: "refused", reason: "wrong-shape-mode", class: "recoverable", locus: "authoring.shape",
      remedy: { text: `Run this map with ${renderV3DecomposeArgv(argv)}.`, argv } };
  }
  return { status: "ok", result: { map: decoded.value, acquired: fresh.result.acquired } };
}
