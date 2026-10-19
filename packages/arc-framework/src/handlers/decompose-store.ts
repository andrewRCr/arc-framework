/** Capability-selected decomposition over one operational store and lifecycle executor. */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DecomposeCommandInput, DecomposeDispatchRefusal } from "./decompose.js";
import { buildExecutor, type VerbBase } from "./lifecycle-shared.js";
import { resolveUserIdentity } from "./shared.js";
import { getArcTemplatePath } from "../lib/paths.js";
import { createStoreTeardownContext } from "../lib/work-unit/store-teardown-context.js";
import { ENTRY_CONFIGS } from "../lib/store/kinds/entry-configs.js";
import type { Store } from "../lib/store/contract.js";
import type { DecomposeContext, DecomposeMapInput } from "../lib/decompose/context.js";
import type { DecomposeResult } from "../lib/decompose/refusal.js";
import { runStoreDecomposePreflight } from "../lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../lib/decompose/discard.js";
import { runStoreDecomposeRevisionStarter } from "../lib/decompose/revision-starter.js";
import { runStoreDecomposeRevision } from "../lib/decompose/revision.js";

/** Run one validated store-mode invocation without touching repository-backed decomposition. */
export async function runStoreDecomposeCommand(input: DecomposeCommandInput,
  base: Omit<VerbBase, "identity" | "store"> & { store: Store }): Promise<DecomposeResult<unknown> | DecomposeDispatchRefusal> {
  if (input.advanceBase !== undefined) return refusal("unsupported",
    `No base is advanced for a stored cut. Preview it with arc decompose ${input.origin} --finish.`,
    ["arc", "decompose", input.origin, "--finish"]);
  if (typeof input.finish === "string") return refusal("finish-map-operand",
    `The cut map is stored. Preview it with arc decompose ${input.origin} --finish.`,
    ["arc", "decompose", input.origin, "--finish"]);
  let identity: string;
  try { identity = await resolveUserIdentity(base.io.exec); }
  catch (error) { return refusal("identity-required", `Resolve the configured ARC identity, then retry: ${detail(error)}`, ["arc", "init"]); }
  try {
    const bound: VerbBase = { ...base, identity };
    const { executor, settings } = await buildExecutor(bound);
    const cohortTemplate = await readFile(join(getArcTemplatePath(), "reference/templates/arc/work-unit/template-cohort.md"), "utf8");
    const ctx: DecomposeContext = { executor: { ...executor, store: base.store, exec: executor.exec ?? base.io.exec },
      identity, cohortTemplate, inboundGrammar: ENTRY_CONFIGS["work-item/inbound"], baseBranch: settings["branch.base"],
      removal: { exec: base.io.exec }, storeTeardown: createStoreTeardownContext(bound, executor) };
    return await dispatch(ctx, input, base.cwd);
  } catch (error) { return refusal("unexpected-error", `Repair the reported operation and retry the selected mode: ${detail(error)}`); }
}

async function dispatch(ctx: DecomposeContext, input: DecomposeCommandInput, cwd: string): Promise<DecomposeResult<unknown>> {
  if (input.preflight === true) return runStoreDecomposePreflight(ctx, input.origin);
  if (input.finish === true) return runStoreDecomposeFinish(ctx, input.origin, { applyAuthority: input.apply });
  if (input.discard === true) return runStoreDecomposeDiscard(ctx, input.origin, { applyAuthority: input.apply });
  if (input.revise === true) return runStoreDecomposeRevisionStarter(ctx, input.origin);
  const cutMapPath = input.execute ?? input.extract ?? input.revise;
  if (typeof cutMapPath !== "string") throw new Error("Validated store invocation has no selected mode.");
  const loaded = await readMap(cwd, cutMapPath);
  if (loaded.status === "refused") return loaded;
  if (typeof input.revise === "string") return runStoreDecomposeRevision(ctx, input.origin, loaded.result, { applyAuthority: input.apply });
  const additive = await runStoreDecomposeAdditive(ctx, input.origin, input.execute === undefined ? "extract" : "execute", loaded.result);
  return additive.status === "refused" ? additive : { status: "ok", result: additive.result.report };
}

async function readMap(cwd: string, cutMapPath: string): Promise<DecomposeResult<DecomposeMapInput>> {
  try {
    const cutMap: unknown = JSON.parse(await readFile(resolve(cwd, cutMapPath), "utf8"));
    return { status: "ok", result: { cutMap, cutMapPath } };
  } catch { return { status: "refused", reason: "invalid-structure", class: "recoverable", locus: cutMapPath,
    remedy: { text: "Restore a readable JSON cut map at the supplied path, then retry the same mode." } }; }
}
function refusal(reason: string, text: string, argv?: string[]): DecomposeDispatchRefusal {
  return { status: "refused", reason, class: "recoverable", remedy: { text, ...(argv === undefined ? {} : { argv }) } };
}
function detail(error: unknown): string { return error instanceof Error ? error.message : String(error); }
