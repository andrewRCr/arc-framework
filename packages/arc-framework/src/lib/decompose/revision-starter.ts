/** Read-only re-binding of a stored cut's authoring to fresh source and edge facts. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeStoredCut } from "./stored-cut.js";
import { acquireDecomposeRevision } from "./acquire-revision.js";
import { acquireDecomposeMapHistory, unavailableDecomposeBirth } from "./owner-birth-history.js";
import { decomposeReadCache } from "./read-cache.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { rebindDecomposeMap } from "./rebind.js";
import { canonicalize } from "../kernel/canonical/canonical-json.js";
import type { Store } from "../store/contract.js";
import { decodeCutMapContent } from "../store/kinds/cut-map/index.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Emit canonical JSON containing carried authoring or its first reauthoring boundary. */
export async function runStoreDecomposeRevisionStarter(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<string>> {
  const store = decomposeReadCache(ctx.executor.store);
  const acquired = await acquireDecomposeRevision({ ...ctx, executor: { ...ctx.executor, store } }, origin);
  if (acquired.status === "refused") return acquired;
  const previous = await previousCutMaps(store, acquired.result);
  if (previous.status === "refused") return previous;
  const report = rebindDecomposeMap(acquired.result.map, acquired.result.machine, previous.result);
  return report.status === "refused" ? report : { status: "ok", result: canonicalize(report.result) };
}

async function previousCutMaps(store: Pick<Store, "history">, cut: DecomposeStoredCut): Promise<DecomposeResult<CutMap[]>> {
  const { storedMap, map } = cut;
  const history = await acquireDecomposeMapHistory(store, storedMap.reference);
  if (history.status === "refused") return history;
  const head = history.result[0];
  if (head?.version !== storedMap.version) {
    const argv = [...decomposeReviseArgv(storedMap.reference.owner.name)];
    return { status: "refused", reason: "version-conflict", class: "recoverable", locus: "storedMap",
      message: `Read cut map at ${storedMap.version}, but cut-map history reported ${head?.version ?? "no current version"}.`,
      remedy: { text: `Read the current cut and its history again with ${renderV3DecomposeArgv(argv)}.`, argv } };
  }
  const previous: CutMap[] = [];
  const seen = new Set([canonicalize(map)]);
  for (const entry of history.result) {
    if (entry.content === null) break;
    if (!("verb" in entry.provenance) || entry.provenance.verb !== "decompose") continue;
    const stored = decodeCutMapContent(entry.content);
    if (!stored.success) return unavailableDecomposeBirth(storedMap.reference.owner.name,
      `Required historical stored map is invalid: ${stored.error}`);
    const key = canonicalize(stored.data.map);
    if (!seen.has(key)) {
      seen.add(key);
      previous.push(stored.data.map);
    }
    if (entry.provenance.lifecycleAction === "additive") break;
  }
  return { status: "ok", result: previous };
}
