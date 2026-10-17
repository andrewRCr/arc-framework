/** Capability-selected start handler: operational records never require a code-branch snapshot. */
import { basename } from "node:path";
import * as p from "../lib/terminal.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { readLifecycleView } from "../lib/store/lifecycle-view.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { LifecycleEntry } from "../lib/store/lifecycle-index.js";
import type { Store } from "../lib/store/contract.js";
import { requireCompleteInventory } from "../lib/store/lifecycle-storage.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { findWorkUnitHoldingCheckout } from "../lib/work-unit/verbs/unshared-work.js";
import { resolveLifecycleBase } from "../lib/git/lifecycle-ref-refresh.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { runCreateNew, runGraduate, resolveStartDispatch } from "../commands/start.js";
import type { UserIOContext } from "../commands/user/types.js";
import type { LocusPorts } from "../lib/work-unit/locus-ports.js";
import type { ExecuteTransitionContext } from "../lib/work-unit/lifecycle-executor.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { StartOptions } from "./start.js";
import { quoteShellArgument } from "../lib/release/commit-message-retry.js";

type Input = StartOptions & { name?: string };
/** Locus may supply cold-start admission independently of backlog graduation. */
export interface StoreStartContext {
  cwd: string; io: UserIOContext; identity: string; interaction: InteractionContext;
  executor: ExecuteTransitionContext; locusPorts?: LocusPorts;
  admitColdStart?: (input: Input) => Promise<void>;
}
/** Resolve dispatch through a complete view, then perform only the selected store arm. */
export async function handleStoreStart(input: Input, ctx: StoreStartContext): Promise<void> {
  const store = ctx.executor.store;
  if (store === undefined) throw new Error("Store start requires an operational store");
  if (input.here && (input.new || input.name === undefined) && ctx.admitColdStart !== undefined) { await ctx.admitColdStart(input); return; }
  if (input.name === undefined) { refuse("Store-backed start requires a work-unit name; supply arc start <name>."); return; }
  const view = await readLifecycleView(store);
  if (view.status === "refused") { refuse(`${view.refusal.condition} ${view.refusal.remedy.text}`); return; }
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { refuse(String(error)); return; }
  const name = await resolveStartName(store, input.name);
  if (name === null) return;
  const selectedInput = { ...input, name };
  const dispatch = resolveStartDispatch(view.result.index, name, { create: input.new === true });
  switch (dispatch.arm) {
    case "refuse": {
      refuse(await startedPlanningReason(view.result.entries, name, ctx) ?? dispatch.reason);
      return;
    }
    case "resume": refuse("Use arc materialize for an in-flight work unit; parking is unavailable with store-backed state."); return;
    case "create-new": await create(selectedInput, ctx); return;
    case "graduate": await graduate(selectedInput, ctx); return;
  }
}
async function startedPlanningReason(entries: readonly LifecycleEntry[],
  name: string, ctx: StoreStartContext): Promise<string | null> {
  const entry = entries.find((item) => item.reference.owner.name === name);
  if (entry?.phase !== "Planning" || entry.location !== "active" || ctx.executor.exec === undefined) return null;
  const holder = await findWorkUnitHoldingCheckout({ cwd: ctx.cwd, exec: ctx.executor.exec, locusPorts: ctx.executor.locusPorts }, name);
  return holder === null ? `${name} is already started; run arc materialize ${name} to give it a checkout.`
    : `${name} is already started in checkout ${holder}; continue work there.`;
}
async function resolveStartName(store: Store, requested: string): Promise<string | null> {
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(requested) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "not-found") return requested;
    refuse(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`); return null;
  }
  if (lookup.result.reference.kind !== "work-item/meta") { refuse(`${requested} resolves to an Errand; use its Errand verb.`); return null; }
  return lookup.result.reference.owner.name;
}
async function create(input: Input, ctx: StoreStartContext): Promise<void> {
  if (input.class !== undefined) { refuse("--class is only valid when graduating a backlog stub."); return; }
  if (!input.here && input.from !== undefined) {
    refuse(`Spawning creation cannot take a seed; run arc start --here --from ${quoteShellArgument(input.from)} from the intended checkout.`); return;
  }
  if (input.here || input.from !== undefined) { refuse("In-place creation requires the cold-start checkout admission provider."); return; }
  const { settings } = await readConfigSettings(ctx.cwd);
  const baseRef = await resolveLifecycleBase(ctx.io.exec, ctx.cwd, settings["branch.base"]);
  if (baseRef === null) { refuse(`No base ref resolves; run git branch ${settings["branch.base"]} <commit> or fetch the configured base, then retry start.`); return; }
  const result = await runCreateNew({ store: ctx.executor.store, locusPorts: ctx.locusPorts, io: ctx.io, internalTemplateDir: getInternalTemplatePath() },
    { name: input.name, worktreePath: ctx.cwd, identity: ctx.identity, baseRef });
  if (!result.ok) { refuse(result.reason); return; }
  p.note(`Work unit: ${input.name}\nCheckout: detached\nWorktree: ${result.value.worktreePath}`, "Started");
  if (result.value.postCreateNotice !== undefined) p.log.info(result.value.postCreateNotice);
  p.outro("Done.");
}
async function graduate(input: Input, ctx: StoreStartContext): Promise<void> {
  if (input.from !== undefined) { refuse("--from is only valid when starting a new work unit."); return; }
  if (input.name === undefined) throw new Error("Graduation requires its dispatched name");
  const { settings } = await readConfigSettings(ctx.cwd);
  const primaryWorktreePath = input.here ? null : await resolvePrimaryWorktreePath(ctx.io.exec);
  if (!input.here && primaryWorktreePath === null) { refuse("Could not resolve the primary checkout for detached graduation."); return; }
  const base = input.here ? undefined : await resolveLifecycleBase(ctx.io.exec, ctx.cwd, settings["branch.base"]);
  if (base === null) { refuse(`No base ref resolves; run git branch ${settings["branch.base"]} <commit> or fetch the configured base, then retry start.`); return; }
  const params = input.here ? { inPlace: true as const } : { baseBranch: base ?? settings["branch.base"], locationTemplate: settings["worktree.location_template"],
    repo: basename(primaryWorktreePath ?? ctx.cwd), primaryWorktreePath: primaryWorktreePath ?? undefined,
    postCreateScript: settings["worktree.post_create"], registeredHarnessDirs: settings["worktree.harness_dirs"] };
  const result = await runGraduate(ctx.executor, { name: input.name, cls: input.class, spawningIdentity: ctx.identity, ...params });
  if (result.status !== "graduated") { refuse(result.reason); return; }
  p.note(`Work unit: ${input.name}\nPrevious Owner: ${result.previousOwner ?? "[none]"}\nOwner: ${ctx.identity}\nWorktree: ${result.worktreePath ?? ctx.cwd}`, "Started in Planning");
  if (result.postCreateNotice !== undefined) p.log.info(result.postCreateNotice);
  p.outro("Done.");
}
function refuse(reason: string): void { p.log.error(reason); process.exitCode = 1; }
