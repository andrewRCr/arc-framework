/** Capability-selected start handler: operational records never require a code-branch snapshot. */
import { basename } from "node:path";
import * as p from "../lib/terminal.js";
import { refuse } from "./lifecycle-shared.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { readLifecycleView } from "../lib/store/lifecycle-view.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { LifecycleEntry } from "../lib/store/lifecycle-index.js";
import { sameReference, type RecordReference } from "../lib/store/identity.js";
import type { Store } from "../lib/store/contract.js";
import { requireCompleteInventory } from "../lib/store/lifecycle-storage.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { findWorkUnitHoldingCheckout } from "../lib/work-unit/verbs/unshared-work.js";
import { resolveLifecycleBase } from "../lib/git/lifecycle-ref-refresh.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { runCreateNew, runGraduate, resolveStartDispatch } from "../commands/start.js";
import type { UserIOContext } from "../commands/user/types.js";
import type { ExecuteTransitionContext } from "../lib/work-unit/lifecycle-executor.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { StartOptions } from "./start.js";
import { quoteShellArgument } from "../lib/release/commit-message-retry.js";

type Input = StartOptions & { name?: string };
/** Locus may supply cold-start admission independently of backlog graduation. */
export interface StoreStartContext {
  cwd: string; io: UserIOContext; identity: string; interaction: InteractionContext;
  executor: ExecuteTransitionContext;
  admitColdStart?: (input: Input) => Promise<void>;
}
/** Resolve dispatch through a complete view, then perform only the selected store arm. */
export async function handleStoreStart(input: Input, ctx: StoreStartContext): Promise<void> {
  const store = ctx.executor.store;
  if (store === undefined) throw new Error("Store start requires an operational store");
  if (input.here && input.name === undefined && ctx.admitColdStart !== undefined) { await ctx.admitColdStart(input); return; }
  if (input.name === undefined) { refuse("Store-backed start requires a work-unit name; supply arc start <name>."); return; }
  const view = await readLifecycleView(store);
  if (view.status === "refused") { refuse(view.refusal.condition, view.refusal); return; }
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { refuse(String(error)); return; }
  const selected = await resolveStartName(store, input.name);
  if (selected === null) return;
  const { name } = selected;
  const selectedInput = { ...input, name };
  const dispatch = resolveStartDispatch(view.result.index, name, { create: input.new === true });
  switch (dispatch.arm) {
    case "refuse": {
      refuse(await startedPlanningReason(view.result.entries, selected, ctx) ?? dispatch.reason);
      return;
    }
    case "resume": refuse("Use arc materialize for an in-flight work unit; parking is unavailable with store-backed state."); return;
    case "create-new": await create(selectedInput, ctx); return;
    case "graduate": await graduate(selectedInput, ctx); return;
  }
}
async function startedPlanningReason(entries: readonly LifecycleEntry[],
  selected: { name: string; reference?: RecordReference }, ctx: StoreStartContext): Promise<string | null> {
  const { name, reference } = selected;
  const entry = reference === undefined ? undefined : entries.find((item) => sameReference(item.reference, reference));
  if (entry?.phase !== "Planning" || entry.location !== "active" || ctx.executor.exec === undefined) return null;
  let holder: string | null;
  try { holder = await findWorkUnitHoldingCheckout({ cwd: ctx.cwd, exec: ctx.executor.exec, locusPorts: ctx.executor.locusPorts, store: ctx.executor.store }, entry); }
  catch (error) { return error instanceof Error ? error.message : String(error); }
  return holder === null ? `${name} is already started; run arc materialize ${name} to give it a checkout.`
    : `${name} is already started in checkout ${holder}; continue work there.`;
}
async function resolveStartName(store: Store, requested: string): Promise<{ name: string; reference?: RecordReference } | null> {
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(requested) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "not-found") return { name: requested };
    refuse(lookup.refusal.condition, lookup.refusal); return null;
  }
  if (lookup.result.reference.kind === "cohort/document") {
    refuse(`\`${requested}\` resolves to a cohort rather than a work unit. Use the cohort's own commands, or name a work unit.`);
    return null;
  }
  if (lookup.result.reference.kind !== "work-item/meta") { refuse(`${requested} resolves to an Errand; use its Errand verb.`); return null; }
  const name = lookup.result.reference.owner.name;
  if (name !== requested) {
    const current = await store.lookup({ kind: "slug", slug: SlugSchema.parse(name) });
    if (current.status === "refused") { refuse(current.refusal.condition, current.refusal); return null; }
  }
  return { name, reference: lookup.result.reference };
}
async function create(input: Input, ctx: StoreStartContext): Promise<void> {
  if (input.class !== undefined) { refuse("--class is only valid when graduating a backlog stub."); return; }
  if (!input.here && input.from !== undefined) {
    refuse(`Spawning creation cannot take a seed; run arc start --here --from ${quoteShellArgument(input.from)} from the intended checkout.`); return;
  }
  if (input.here || input.from !== undefined) {
    if (ctx.admitColdStart === undefined) { refuse("In-place creation requires the cold-start checkout admission provider."); return; }
    await ctx.admitColdStart(input); return;
  }
  const { settings } = await readConfigSettings(ctx.cwd);
  const baseRef = await resolveLifecycleBase(ctx.io.exec, ctx.cwd, settings["branch.base"]);
  if (baseRef === null) { refuse(`No base ref resolves; run git branch ${settings["branch.base"]} <commit> or fetch the configured base, then retry start.`); return; }
  const result = await runCreateNew({ store: ctx.executor.store, locusPorts: ctx.executor.locusPorts, io: ctx.io, internalTemplateDir: getInternalTemplatePath() },
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
  if (result.status !== "graduated") { refuse(result.reason, result.status === "rejected" ? result.refusal : undefined); return; }
  p.note(`Work unit: ${input.name}\nPrevious Owner: ${result.previousOwner ?? "[none]"}\nOwner: ${ctx.identity}\nWorktree: ${result.worktreePath ?? ctx.cwd}`, "Started in Planning");
  if (result.postCreateNotice !== undefined) p.log.info(result.postCreateNotice);
  p.outro("Done.");
}
