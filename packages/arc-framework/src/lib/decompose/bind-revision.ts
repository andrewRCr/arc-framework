/** Completed revision maps bound to one current cut and fresh source facts. */
import type { DecomposeContext, DecomposeMapInput } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import { acquireDecomposeRevision, type DecomposeRevisionInput } from "./acquire-revision.js";
import { decodeCutMap } from "./cut-map-decode.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Prior cut identity and the operator's newly bound map. */
export interface BoundDecomposeRevision { prior: DecomposeRevisionInput; map: CutMap }

/** Decode authoring and require its entire machine half to match current revision facts. */
export async function bindDecomposeRevisionMap(ctx: DecomposeContext, origin: string,
  input: DecomposeMapInput): Promise<DecomposeResult<BoundDecomposeRevision>> {
  const decoded = decodeCutMap(input.cutMap);
  const argv = decomposeReviseArgv(origin);
  if (decoded.status === "rejected") {
    const { code, path, message } = decoded.issue;
    return { status: "refused", reason: code, class: "recoverable", locus: path || "$", message,
      remedy: { text: code === "unsupported-version" ? `Generate a version-4 revision starter with ${renderV3DecomposeArgv(argv)}.`
        : `Correct ${JSON.stringify(input.cutMapPath)} at ${path || "$"}, then retry the revision.`, argv: [...argv] } };
  }
  const prior = await acquireDecomposeRevision(ctx, origin);
  if (prior.status === "refused") return prior;
  if (canonicalize(decoded.value.machine) !== canonicalize(prior.result.machine)) return { status: "refused",
    reason: "stale-machine", class: "recoverable", locus: "machine",
    remedy: { text: `Generate a fresh revision starter with ${renderV3DecomposeArgv(argv)}, then complete its decisions.`, argv: [...argv] } };
  return { status: "ok", result: { prior: prior.result, map: decoded.value } };
}
