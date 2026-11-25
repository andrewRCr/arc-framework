/** Rehearse the window's sequence on a repository copy, stopping at the first unexpected outcome. */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { WindowRequest } from "./main.js";
import { WindowRefusal, type WindowResult } from "./result.js";
import { assertWindowCopySafety, type WindowCopyBounds, type WindowCopySafetyOptions } from "./copy-safety.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { withoutWindowArcDirectories } from "./executables.js";
import { defaultWindowRehearsalLauncher, rebuildWindowRehearsalPrimary, type WindowRehearsalLauncher } from "./rehearse-launch.js";
import { WindowRehearsalSync, type WindowRehearsalLayout, type WindowRehearsalRebuild } from "./rehearse-sync.js";
import type { WindowRehearsalContext, WindowRehearsalFlip, WindowRehearsalPlan, WindowRehearsalPlant } from "./rehearse-run.js";
import type { WindowRehearsalExpectedFinding } from "./rehearse-expect.js";
import { checkWindow } from "./check.js";
import { abortRehearsalPlan } from "./rehearse-plan-abort.js";
import { mergeRehearsalPlan } from "./rehearse-plan-merge.js";
import { abandonRehearsalErrands, cleanRehearsalCheckouts, createRehearsalFlip, dropRehearsalStashes,
  plantRehearsalInboxEntry, remedyRehearsalSeals, remedyRehearsalTrackedState } from "./rehearse-prepare.js";
import { accountRehearsal, chainRehearsal, checkRehearsal, designateRehearsalRemote, expectRehearsalOperation, importRehearsal,
  lockRehearsal, rehearsalCheckArgs,
  recomputeRehearsal, refuseRehearsalSealedWrites, saveRehearsalPersonalState, verifyRehearsalIdentityRefs,
  type WindowRehearsalImportMeasurement } from "./rehearse-window.js";

/** Boundaries a caller replaces: host discovery, the ARC launcher, the primary copy's rebuild, and the run plan. */
export interface WindowRehearsalOptions extends WindowCopySafetyOptions {
  launcher?: WindowRehearsalLauncher; rebuild?: WindowRehearsalRebuild; plan?: WindowRehearsalPlan;
}

/** Validated rehearsal inputs apart from the explicit copy; a copy predating the tooling supplies its anchor. */
export interface WindowRehearsalInput {
  anchor?: string; path?: string; flip: WindowRehearsalFlip; import: WindowRehearsalContext["importBounds"]; plan?: WindowRehearsalPlan;
}

/** The repository's run plans, by the name `--plan` takes. */
export const windowRehearsalPlans: Readonly<Record<string, WindowRehearsalPlan>> = { abort: abortRehearsalPlan, merge: mergeRehearsalPlan };

/** One step's name and outcome, in the order the run reached it. */
export interface WindowRehearsalStepOutcome { step: string; outcome: "passed" | "stopped"; detail: string }

type WindowRehearsalStep = readonly [string, (context: WindowRehearsalContext) => Promise<string>];

/** Run the sequence on the copy whose primary checkout is the request's target. */
export async function rehearseWindow(request: WindowRequest, options: WindowRehearsalOptions = {}): Promise<WindowResult> {
  const input = parseRehearsalInput(request.args);
  const bounds = windowCopyBounds(request.repo);
  await assertWindowCopySafety(bounds, options);
  const workspace = join(bounds.destination, "rehearsal");
  const layout: WindowRehearsalLayout = { ...bounds, workspace, scratch: join(workspace, "scratch") };
  const path = await withoutWindowArcDirectories(process.env.PATH ?? "");
  await mkdir(workspace, { recursive: true });
  const exec = createDefaultStorePorts({ checkoutRoot: layout.repo }).exec;
  const sync = new WindowRehearsalSync(layout, exec, options.rebuild ?? (primary => rebuildWindowRehearsalPrimary(primary, path)));
  const context: WindowRehearsalContext = { layout, sync, exec, flip: input.flip, checkPath: input.path ?? process.env.PATH ?? "",
    importBounds: input.import,
    launcher: options.launcher ?? defaultWindowRehearsalLauncher(layout.repo), environment: { path },
    listing: join(workspace, "pull-requests.json"), ...input.anchor !== undefined ? { anchor: input.anchor } : {} };
  const measured: { import?: WindowRehearsalImportMeasurement } = {};
  const plan = options.plan ?? input.plan ?? {};
  const result = await runRehearsalSteps(context, rehearsalSteps(plan, measurement => { measured.import = measurement; }));
  return { ...result, data: { ...result.data as object, ...measured } };
}

/** The copy layout `copy` creates: the primary checkout and the mirror side by side in its destination. */
export function windowCopyBounds(repo: string): WindowCopyBounds {
  const destination = dirname(repo);
  return { destination, repo, mirror: join(destination, "mirror.git") };
}

function rehearsalSteps(plan: WindowRehearsalPlan,
  record: (measurement: WindowRehearsalImportMeasurement) => void): WindowRehearsalStep[] {
  return [
    ["open the scratch clone", async context => { await context.sync.open(); return "Cloned the mirror without hooks."; }],
    ["fetch from the mirror", async context => { await context.sync.sync(); return "Fetched every branch from the mirror."; }],
    ["clean the checkouts", cleanRehearsalCheckouts],
    ...optionalStep("plan setup", plan.setup && (async context => {
      const detail = await plan.setup?.(context) ?? ""; await context.sync.sync(); return detail;
    })),
    ["remedy tracked state", remedyRehearsalTrackedState],
    ["remedy the seals", remedyRehearsalSeals],
    ["abandon the Errands", abandonRehearsalErrands],
    ["drop tracked-state stashes", dropRehearsalStashes],
    ["create the stand-in flip", createRehearsalFlip],
    ["plant an inbox entry", plantRehearsalInboxEntry],
    ...optionalStep("plan observation after preparation", plan.prepared && (async context => {
      await plan.prepared?.(context); return "The plan's observation passed.";
    })),
    ...plantSteps(plan),
    ["check", checkRehearsal],
    ["save personal state", saveRehearsalPersonalState],
    ["designate the state remote", designateRehearsalRemote],
    ...optionalStep("plan before the import", plan.beforeImport),
    ["import", context => importRehearsal(context, record)],
    ["refuse sealed writes", refuseRehearsalSealedWrites],
    ["retire identity refs", verifyRehearsalIdentityRefs],
    ["account", async context => accountRehearsal(context, await plan.account?.(context))],
    ["chain", chainRehearsal],
    ["recompute", context => recomputeRehearsal(context)],
    ...optionalStep("plan after the last step", plan.after),
  ];
}

function plantSteps(plan: WindowRehearsalPlan): WindowRehearsalStep[] {
  const plants = plan.plants ?? [];
  if (plants.length === 0) return [["lock", lockRehearsal]];
  const expected: WindowRehearsalExpectedFinding[] = [];
  const apply = (point: WindowRehearsalPlant["point"]): WindowRehearsalStep[] => {
    const planted = plants.filter(plant => plant.point === point);
    return planted.length === 0 ? [] : [[`plant ${point}`, async context => {
      for (const plant of planted) expected.push(...await plant.apply(context));
      return `Planted ${planted.map(plant => plant.name).join(", ")}.`;
    }]];
  };
  return [...apply("before lock"), ["lock", lockRehearsal], ...apply("after lock"),
    ["check with plants", async context => {
      const collateral = await plan.collateral?.(context) ?? [];
      return expectRehearsalOperation(context, "check", checkWindow, rehearsalCheckArgs(context),
        { status: "refused", findings: [...expected, ...collateral] });
    }],
    ["remove plants", async context => {
      for (const plant of [...plants].reverse()) await plant.remove(context);
      return `Removed ${plants.map(plant => plant.name).join(", ")}.`;
    }],
    ["lock again", lockRehearsal]];
}

function optionalStep(name: string, run: ((context: WindowRehearsalContext) => Promise<string>) | undefined): WindowRehearsalStep[] {
  return run === undefined ? [] : [[name, run]];
}

async function runRehearsalSteps(context: WindowRehearsalContext, steps: readonly WindowRehearsalStep[]): Promise<WindowResult> {
  const outcomes: WindowRehearsalStepOutcome[] = [];
  const report = () => outcomes.map(outcome => `${outcome.step}: ${outcome.outcome} — ${outcome.detail}`);
  for (const [step, run] of steps) {
    try {
      outcomes.push({ step, outcome: "passed", detail: await run(context) });
    } catch (error) {
      const condition = describeFailure(error);
      outcomes.push({ step, outcome: "stopped", detail: condition });
      return { operation: "rehearse", status: "stopped", messages: report(), data: { steps: outcomes },
        findings: [{ subject: step, condition, remedy: "Inspect the copy at this step. Repair the tools, or repair the live repository and take a new copy, then rehearse again." }] };
    }
  }
  return { operation: "rehearse", status: "passed", findings: [], messages: report(), data: { steps: outcomes } };
}

function describeFailure(error: unknown): string {
  if (error instanceof WindowRefusal) return error.findings.map(finding => `${finding.subject}: ${finding.condition}`).join("\n");
  return error instanceof Error ? error.message : String(error);
}

function parseRehearsalInput(args: readonly string[]): WindowRehearsalInput {
  try {
    const { values } = parseArgs({ args: [...args], options: {
      repo: { type: "string" }, json: { type: "boolean" }, anchor: { type: "string" }, path: { type: "string" },
      "flip-branch": { type: "string", default: "rehearsal/flip" }, "flip-pr": { type: "string", default: "1" },
      "heap-mb": { type: "string", default: "4096" }, "cap-wrapper": { type: "string", default: "[]" }, plan: { type: "string" },
    } });
    const plan = values.plan === undefined ? undefined : windowRehearsalPlans[values.plan];
    if (values.plan !== undefined && (plan === undefined || !Object.hasOwn(windowRehearsalPlans, values.plan))) {
      throw new Error(`Unknown run plan ${values.plan}; the plans are ${Object.keys(windowRehearsalPlans).join(", ")}.`);
    }
    const pullRequest = Number(values["flip-pr"]), heapMb = Number(values["heap-mb"]);
    if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) throw new Error("The stand-in flip's pull-request number must be positive.");
    if (!Number.isSafeInteger(heapMb) || heapMb <= 0) throw new Error("The import's heap ceiling must be a positive number of MiB.");
    return { flip: { branch: values["flip-branch"], pullRequest }, import: { heapMb, prefix: parseCapWrapper(values["cap-wrapper"]) },
      ...plan !== undefined ? { plan } : {},
      ...values.anchor !== undefined ? { anchor: values.anchor } : {}, ...values.path !== undefined ? { path: values.path } : {} };
  } catch (error) {
    throw new WindowRefusal([{ subject: "rehearse options", condition: error instanceof Error ? error.message : String(error),
      remedy: "Name the copy's primary checkout with --repo and supply valid rehearsal options, then retry." }]);
  }
}

function parseCapWrapper(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((part): part is string => typeof part === "string")) {
    throw new Error("--cap-wrapper takes a JSON array of argument strings.");
  }
  return parsed;
}
