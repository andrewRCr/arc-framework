/** Store-held backlog graduation with reversible branchless checkout occupation. */
import type { ExecuteTransitionContext } from "../lib/work-unit/lifecycle-executor.js";
import { executeTransition } from "../lib/work-unit/lifecycle-executor.js";
import { occupyStoreGraduation, type StoreGraduationOccupation } from "../lib/work-unit/atomic-graduation.js";
import { requireMarkerExclusivity } from "../lib/work-unit/locus-ports.js";
import { readLifecycleView } from "../lib/store/lifecycle-view.js";
import { lifecycleArtifactPath, requireCompleteInventory } from "../lib/store/lifecycle-storage.js";
import { readWorkUnit } from "../lib/store/lifecycle-write.js";
import { BEGIN_CURRENT_WORKFLOW_SENTINEL } from "../lib/active/current-workflow-consistency.js";
import { writeMetaCurrentWorkflow, writeMetaNextAction, writeMetaClass, writeMetaOwner } from "../lib/store/kinds/meta/writers.js";
import { WorkClassSchema, SlugSchema } from "../lib/kernel/index.js";
import type { GraduateParams, GraduateResult } from "./start.js";

/** Read state and Class through the store before a physical operation or prepared batch. */
export async function runStoreGraduate(ctx: ExecuteTransitionContext, params: GraduateParams): Promise<GraduateResult> {
  try { return await graduate(ctx, params); }
  catch (error) { return { status: "rejected", reason: error instanceof Error ? error.message : String(error) }; }
}
async function graduate(ctx: ExecuteTransitionContext, params: GraduateParams): Promise<GraduateResult> {
  if (ctx.store === undefined || ctx.exec === undefined || params.spawningIdentity === undefined) return { status: "rejected", reason: "Store graduation requires the store, Git executor, and starter identity." };
  const view = await readLifecycleView(ctx.store);
  if (view.status === "refused") return { status: "rejected", reason: `${view.refusal.condition} ${view.refusal.remedy.text}` };
  try { requireCompleteInventory(ctx.store, view.result.listing); } catch (error) { return { status: "rejected", reason: String(error) }; }
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: `${read.refusal.condition} ${read.refusal.remedy.text}` };
  const name = read.result.reference.owner.name;
  const entry = view.result.entries.find((candidate) => candidate.reference.owner.name === read.result.reference.owner.name);
  if (entry === undefined || (entry.location !== "planned" && entry.location !== "provisional")) return { status: "rejected", reason: `${name} is not a backlog stub that can graduate.` };
  if (entry.version !== read.result.version) return { status: "rejected", reason: `${name} changed after its inventory read; retry start to use its current Class and ownership.` };
  const recordedClass = WorkClassSchema.safeParse(entry.fields.workClass);
  if (params.cls !== undefined && recordedClass.success && params.cls !== recordedClass.data) {
    return { status: "rejected", reason: `--class ${params.cls} conflicts with the recorded Class ${recordedClass.data}; re-cut weight via arc finalize, then retry start.` };
  }
  const cls = WorkClassSchema.safeParse(params.cls ?? entry.fields.workClass);
  if (!cls.success) return { status: "rejected", reason: `Cannot start ${name}: Class is unresolved; supply --class Light, Heavy, or Novel.` };
  const starter = params.spawningIdentity;
  const workflow = graduationWorkflow(entry.fields);
  const content = writeMetaNextAction(writeMetaCurrentWorkflow(
    writeMetaOwner(writeMetaClass(read.result.content, cls.data), SlugSchema.parse(starter)), workflow),
  BEGIN_CURRENT_WORKFLOW_SENTINEL);
  let occupation: StoreGraduationOccupation | undefined;
  const retryCommand = ["arc", "start", name, ...(params.inPlace ? ["--here"] : [])];
  const exec = ctx.exec;
  const outcome = await executeTransition(ctx, { verb: "start", slug: name, inputs: {
    class: cls.data,
    storeTransition: { primary: read.result, content, placement: { kind: "active" }, gitSteps: [{
      name: "occupy-planning-checkout", retryCommand,
      run: async () => {
        await requireMarkerExclusivity(ctx.locusPorts, { name });
        occupation = await occupyStoreGraduation({ cwd: ctx.cwd, exec, inPlace: params.inPlace === true,
          occupy: () => ctx.reconcileWorkUnitWorktree(params.inPlace
            ? { mutation: "spawn", inPlace: true, preserveHead: true, wuName: name, spawningIdentity: starter }
            : { mutation: "spawn", detached: true, base: params.baseBranch, wuName: name,
                locationTemplate: params.locationTemplate, repo: params.repo, spawningIdentity: starter,
                primaryWorktreePath: params.primaryWorktreePath, postCreateScript: params.postCreateScript, registeredHarnessDirs: params.registeredHarnessDirs }),
        });
      },
      rollback: async () => { await occupation?.rollback(); },
    }] },
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  if (occupation === undefined) throw new Error("store graduation committed without its checkout occupation");
  return { status: "graduated", outcome, metaPath: lifecycleArtifactPath({ ...entry, placement: { kind: "active" } }, "meta"),
    branch: null, backfilled: [], notice: null, worktreePath: occupation.worktreePath, previousOwner: entry.fields.owner,
    ...(occupation.postCreateNotice === undefined ? {} : { postCreateNotice: occupation.postCreateNotice }) };
}

function graduationWorkflow(fields: { currentWorkflow: string | null; design: readonly string[] }): string {
  return fields.currentWorkflow ?? (fields.design.length > 0
    && fields.design.every((name) => name.startsWith("spec-")) ? "generate-tasks" : "draft-design");
}
