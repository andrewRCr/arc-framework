/** CLI adapters for the delivery authoring spine. */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import { parseMetaFile } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  DeliveryPlanComposer,
  validateDeliveryCompositionCoverage,
} from "../lib/delivery/compose.js";
import type { BoundDesignInventory } from "../lib/delivery/design-inventory.js";
import {
  prepareDeliveryFromBranchAuthoring,
  resolveDeliveryFromBranchProjection,
  resolveDeliveryFromBranchSourceAdvisories,
} from "../lib/delivery/from-branch.js";
import {
  prepareDeliveryFromTasksAuthoring,
  resolveDeliveryFromTasksProjection,
} from "../lib/delivery/from-tasks.js";
import {
  DeliveryPlanV1Codec,
  validateDeliveryPlanRecord,
} from "../lib/delivery/plan.js";
import {
  DeliveryAuthoringManager,
  resolveExistingDeliveryAuthoringMap,
} from "../lib/delivery/authoring-resolution.js";
import { validateDeliveryAuthoringMap } from "../lib/delivery/authoring-map.js";
import { RepositoryDeliveryAuthoringStore } from "../lib/delivery/authoring-store.js";
import { RepositoryDeliveryPlanStore } from "../lib/delivery/local-stores.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "../lib/delivery/plan-resolution.js";
import type { DeliveryPlanV1 } from "../lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { assertCanonicalDigest } from "../lib/kernel/index.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import type { DeliveryTaskInventory } from "../lib/delivery/task-inventory.js";
import { RepositoryDeliveryTaskListRenderer } from "../lib/delivery/task-list-render.js";
import { requireArcProjectRoot } from "./shared.js";

const DeliveryPlanFromTasksInputSchema = z.strictObject({
  designInventory: z.string().trim().min(1),
  json: z.boolean().optional(),
});
const DeliveryPlanFromBranchInputSchema = z.strictObject({
  designInventory: z.string().trim().min(1),
  base: z.string().trim().min(1).optional(),
  head: z.string().trim().min(1).optional(),
  json: z.boolean().optional(),
});
const DeliveryComposeInputSchema = z.strictObject({ json: z.boolean().optional() });
const DeliveryPlanAbandonInputSchema = z.strictObject({ json: z.boolean().optional() });
const FromTasksSourceInputsSchema = z.strictObject({ taskListPath: z.string().min(1) });
const FromBranchSourceInputsSchema = z.strictObject({
  taskListPath: z.string().min(1),
  base: z.string().min(1),
  head: z.string().min(1),
});

export interface DeliveryPlanFromTasksOptions {
  readonly designInventory?: string;
  readonly json?: boolean;
}
export interface DeliveryPlanFromBranchOptions {
  readonly designInventory?: string;
  readonly base?: string;
  readonly head?: string;
  readonly json?: boolean;
}
export interface DeliveryComposeOptions { readonly json?: boolean }
export interface DeliveryPlanAbandonOptions { readonly json?: boolean }

/** Command-input schema owned by the value-taking task-list authoring command. */
export const deliveryCommandInputRegistrations = [
  {
    commandPath: "delivery plan from-tasks",
    schema: DeliveryPlanFromTasksInputSchema,
    schemaFields: {
      "option.designInventory": "designInventory",
      "option.json": "json",
    },
  },
  {
    commandPath: "delivery plan from-branch",
    schema: DeliveryPlanFromBranchInputSchema,
    schemaFields: {
      "option.designInventory": "designInventory",
      "option.base": "base",
      "option.head": "head",
      "option.json": "json",
    },
  },
  {
    commandPath: "delivery compose",
    schema: DeliveryComposeInputSchema,
    schemaFields: { "option.json": "json" },
  },
  {
    commandPath: "delivery plan abandon",
    schema: DeliveryPlanAbandonInputSchema,
    schemaFields: { "option.json": "json" },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Machine-output policies owned by the delivery command family. */
export const deliveryCommandInputPolicyDeclarations = [
  {
    commandPath: "delivery plan from-tasks",
    aliases: [],
    sites: [
      declareCliOptionSite("design-inventory", {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
        cancellation: "not-applicable",
        automation: {
          noInput: "require-explicit",
          flags: ["--design-inventory"],
          acceptedSyntax: ["--design-inventory <json-path>"],
        },
        mutationBoundary: "delivery authoring input validation",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  {
    commandPath: "delivery plan from-branch",
    aliases: [],
    sites: [
      declareCliOptionSite("design-inventory", {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
        cancellation: "not-applicable",
        automation: {
          noInput: "require-explicit",
          flags: ["--design-inventory"],
          acceptedSyntax: ["--design-inventory <json-path>"],
        },
        mutationBoundary: "delivery authoring input validation",
        subprocess: "none",
      }),
      declareCliOptionSite("base", {
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "base",
        defaultSource: "configured base branch",
        cancellation: "not-applicable",
        automation: {
          noInput: "use-default",
          flags: ["--base"],
          acceptedSyntax: ["--base <commit-ish>"],
        },
        mutationBoundary: "branch inspection",
        subprocess: "none",
      }),
      declareCliOptionSite("head", {
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "head",
        defaultSource: "HEAD",
        cancellation: "not-applicable",
        automation: {
          noInput: "use-default",
          flags: ["--head"],
          acceptedSyntax: ["--head <commit-ish>"],
        },
        mutationBoundary: "branch inspection",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  deliveryJsonPolicy("delivery compose"),
  deliveryJsonPolicy("delivery plan abandon"),
] as const satisfies readonly CommandInputDeclaration[];

function deliveryJsonPolicy(commandPath: string): CommandInputDeclaration {
  return {
    commandPath,
    aliases: [],
    sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "owned",
      schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    })],
  };
}

type DeliveryCommandResult =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "refused"; readonly reason: string };

/** Build and persist one task-list-derived starter map after all file input validates. */
export async function handleDeliveryPlanFromTasks(
  opts: DeliveryPlanFromTasksOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanFromTasksInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan from-tasks", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, context);
    return;
  }
  const inputs = await readFromTasksInputs(
    context.cwd,
    context.activePath,
    parsed.data.designInventory,
  );
  if (inputs.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, inputs);
    return;
  }
  const planIdentity = await resolveAuthoringPlanIdentity(context);
  if (planIdentity.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, planIdentity);
    return;
  }
  const prepared = prepareDeliveryFromTasksAuthoring({
    mapId: `map-${randomUUID()}`,
    planId: planIdentity.planId,
    workUnitId: context.workUnitId,
    expectedCurrentPlanDigest: planIdentity.expectedCurrentPlanDigest,
    taskListPath: inputs.taskListPath,
    taskListContent: inputs.taskListContent,
    designInventory: inputs.designInventory,
  });
  if (prepared.status === "refused") {
    emit("delivery plan from-tasks", parsed.data.json === true, prepared);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).create({
    pair: { snapshot: prepared.snapshot, markdown: prepared.markdown },
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan from-tasks", parsed.data.json === true, result.status === "refused"
    ? result
    : {
      status: "ok",
      value: {
        mapId: result.value.snapshot.mapId,
        taskListPath: inputs.taskListPath,
      },
    });
}

/** Build and persist one branch-derived starter map after all inputs validate. */
export async function handleDeliveryPlanFromBranch(
  opts: DeliveryPlanFromBranchOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanFromBranchInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan from-branch", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, context);
    return;
  }
  const base = parsed.data.base ?? context.baseBranch.trim();
  if (base === "") {
    emit("delivery plan from-branch", parsed.data.json === true, {
      status: "refused",
      reason: "base-branch-unresolved",
    });
    return;
  }
  const inputs = await readFromTasksInputs(
    context.cwd,
    context.activePath,
    parsed.data.designInventory,
  );
  if (inputs.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, inputs);
    return;
  }
  const planIdentity = await resolveAuthoringPlanIdentity(context);
  if (planIdentity.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, planIdentity);
    return;
  }
  const prepared = await prepareDeliveryFromBranchAuthoring({
    mapId: `map-${randomUUID()}`,
    planId: planIdentity.planId,
    workUnitId: context.workUnitId,
    expectedCurrentPlanDigest: planIdentity.expectedCurrentPlanDigest,
    taskListPath: inputs.taskListPath,
    taskListContent: inputs.taskListContent,
    designInventory: inputs.designInventory,
    exec: createRawGitExec(context.cwd),
    base,
    head: parsed.data.head ?? "HEAD",
  });
  if (prepared.status === "refused") {
    emit("delivery plan from-branch", parsed.data.json === true, prepared);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).create({
    pair: { snapshot: prepared.snapshot, markdown: prepared.markdown },
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan from-branch", parsed.data.json === true, result.status === "refused"
    ? result
    : {
      status: "ok",
      value: {
        mapId: result.value.snapshot.mapId,
        taskListPath: inputs.taskListPath,
        base: prepared.inspection.base,
        head: prepared.inspection.head,
      },
    });
}

/** Resolve and integrity-check the singleton map before entry adapters project it. */
export async function handleDeliveryCompose(
  opts: DeliveryComposeOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryComposeInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery compose", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery compose", parsed.data.json === true, context);
    return;
  }
  const resolution = await resolveExistingDeliveryAuthoringMap({
    store: context.authoringStore,
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (resolution.status === "indeterminate") {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: resolution.reason,
    });
    return;
  }
  if (resolution.status === "no-match") {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "authoring-map-missing",
    });
    return;
  }
  if (resolution.record.markdown === null) {
    const receipt = resolution.record.snapshot.candidatePlanDigest;
    const current = await context.planStore.readCurrent(resolution.record.snapshot.planId);
    if (receipt === null || current.status === "refused" || current.value?.planDigest !== receipt) {
      emit("delivery compose", parsed.data.json === true, {
        status: "refused",
        reason: "authoring-state-corrupt",
      });
      return;
    }
    const plan = validateDeliveryPlanRecord(current.value);
    if (plan.status === "refused" || plan.plan.entry !== resolution.record.snapshot.source.entry) {
      emit("delivery compose", parsed.data.json === true, {
        status: "refused",
        reason: "authoring-state-corrupt",
      });
      return;
    }
    const sourceAdvisories = resolution.record.snapshot.source.entry === "from-branch"
      ? resolveDeliveryFromBranchSourceAdvisories(resolution.record.snapshot)
      : { status: "resolved" as const, advisories: [] };
    if (sourceAdvisories.status === "refused") {
      emit("delivery compose", parsed.data.json === true, sourceAdvisories);
      return;
    }
    const coverage = validateDeliveryCompositionCoverage({
      entry: plan.plan.entry,
      implementationTaskIds: plan.plan.tasks.implementation.map(({ taskId }) => taskId),
      verificationTaskId: plan.plan.tasks.verificationTaskId,
      members: plan.plan.members.map((member) => ({
        chunkKey: member.chunkKey,
        taskIds: member.taskIds,
      })),
    });
    if (coverage.status === "refused") {
      emit("delivery compose", parsed.data.json === true, {
        status: "refused",
        reason: "authoring-state-corrupt",
      });
      return;
    }
    const cleanup = await context.authoringStore.deleteSnapshot(resolution.record.snapshot.mapId);
    emit("delivery compose", parsed.data.json === true, cleanup.status === "refused"
      ? cleanup
      : {
        status: "ok",
        value: {
          planDigest: receipt,
          recoveredCleanup: true,
          advisories: [...sourceAdvisories.advisories, ...coverage.advisories],
        },
      });
    return;
  }
  const integrity = validateDeliveryAuthoringMap(
    resolution.record.markdown,
    resolution.record.snapshot,
  );
  if (integrity.status === "refused") {
    emit("delivery compose", parsed.data.json === true, integrity);
    return;
  }
  const projection = resolution.record.snapshot.source.entry === "from-tasks"
    ? resolveDeliveryFromTasksProjection({
      snapshot: resolution.record.snapshot,
      slots: integrity.slots,
    })
    : resolveDeliveryFromBranchProjection({
      snapshot: resolution.record.snapshot,
      slots: integrity.slots,
    });
  if (projection.status === "refused") {
    emit("delivery compose", parsed.data.json === true, projection);
    return;
  }
  const sourceInputs = resolution.record.snapshot.source.entry === "from-tasks"
    ? FromTasksSourceInputsSchema.safeParse(resolution.record.snapshot.source.inputs)
    : FromBranchSourceInputsSchema.safeParse(resolution.record.snapshot.source.inputs);
  if (!sourceInputs.success) {
    emit("delivery compose", parsed.data.json === true, {
      status: "refused",
      reason: "authoring-state-corrupt",
    });
    return;
  }
  const composer = new DeliveryPlanComposer({
    authoringStore: context.authoringStore,
    planStore: context.planStore,
    renderer: new RepositoryDeliveryTaskListRenderer(context.cwd, sourceInputs.data.taskListPath),
    transitionSource: context.transitionSource,
  });
  const composition = await composer.compose({
    record: resolution.record,
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
    projection: projection.projection,
    taskInventory: taskInventoryFromSnapshot(resolution.record.snapshot.tasks),
    designInventory: designInventoryFromSnapshot(resolution.record.snapshot.design),
  });
  emit("delivery compose", parsed.data.json === true, composition.status === "refused"
    ? composition
    : {
      status: "ok",
      value: {
        planDigest: composition.plan.planDigest,
        advisories: composition.advisories,
      },
    });
}

/** Abandon the rename-resolved singleton map and tolerate already-absent or torn state. */
export async function handleDeliveryPlanAbandon(
  opts: DeliveryPlanAbandonOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanAbandonInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan abandon", opts.json === true, {
      status: "refused",
      reason: "invalid-command-input",
    });
    return;
  }
  const context = await resolveDeliveryContext(interaction);
  if (context.status === "refused") {
    emit("delivery plan abandon", parsed.data.json === true, context);
    return;
  }
  const result = await new DeliveryAuthoringManager(
    context.authoringStore,
    context.transitionSource,
  ).abandon({
    currentWorkUnitId: context.workUnitId,
    authority: context.authority,
  });
  emit("delivery plan abandon", parsed.data.json === true, result);
}

async function resolveDeliveryContext(interaction?: InteractionContext) {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" } as const;
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved" || active.name === "") {
    return { status: "refused", reason: "active-work-unit-unresolved" } as const;
  }
  const exec = createGitExec(interaction?.subprocess);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const { settings } = await readConfigSettings(cwd);
  const base = settings["branch.base"];
  const authority = base.trim() === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };
  return {
    status: "ok" as const,
    cwd,
    activePath: active.path,
    workUnitId: active.name,
    baseBranch: base,
    authority,
    authoringStore: new RepositoryDeliveryAuthoringStore(publisher),
    planStore: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
    transitionSource: new GitDeliveryRenameTransitionSource(exec),
  };
}

async function resolveAuthoringPlanIdentity(
  context: Extract<Awaited<ReturnType<typeof resolveDeliveryContext>>, { readonly status: "ok" }>,
): Promise<{
  readonly status: "ok";
  readonly planId: string;
  readonly expectedCurrentPlanDigest: string | null;
} | { readonly status: "refused"; readonly reason: string }> {
  const current = await resolveExistingDeliveryPlan<DeliveryPlanV1>({
    planStore: context.planStore,
    currentWorkUnitId: context.workUnitId,
    planWorkUnitId: (plan) => plan.workUnitId,
    authority: context.authority,
    transitionSource: context.transitionSource,
  });
  if (current.status === "indeterminate") {
    return { status: "refused", reason: current.reason };
  }
  return current.status === "match"
    ? {
      status: "ok",
      planId: current.plan.planId,
      expectedCurrentPlanDigest: current.plan.planDigest,
    }
    : {
      status: "ok",
      planId: randomUUID(),
      expectedCurrentPlanDigest: null,
    };
}

async function readFromTasksInputs(
  cwd: string,
  activeMetaPath: string,
  designInventoryPath: string,
): Promise<{
  readonly status: "ok";
  readonly taskListPath: string;
  readonly taskListContent: string;
  readonly designInventory: unknown;
} | { readonly status: "refused"; readonly reason: string }> {
  let meta: ReturnType<typeof parseMetaFile>;
  try {
    meta = parseMetaFile(await readFile(resolve(cwd, activeMetaPath), "utf8"));
  } catch {
    return { status: "refused", reason: "active-work-unit-unreadable" };
  }
  if (meta.taskList === null || meta.taskList === "[none]") {
    return { status: "refused", reason: "task-list-path-unresolved" };
  }
  const taskListPath = resolveRepositoryPath(cwd, `${dirname(activeMetaPath)}/${meta.taskList}`);
  if (taskListPath === null) {
    return { status: "refused", reason: "task-list-path-invalid" };
  }
  let taskListContent: string;
  let designInventory: unknown;
  try {
    taskListContent = await readFile(resolve(cwd, taskListPath), "utf8");
  } catch {
    return { status: "refused", reason: "task-list-unreadable" };
  }
  try {
    designInventory = JSON.parse(await readFile(resolve(cwd, designInventoryPath), "utf8")) as unknown;
  } catch {
    return { status: "refused", reason: "invalid-design-inventory" };
  }
  return { status: "ok", taskListPath, taskListContent, designInventory };
}

function resolveRepositoryPath(cwd: string, candidate: string): string | null {
  if (isAbsolute(candidate)) return null;
  const absolute = resolve(cwd, candidate);
  const relation = relative(cwd, absolute).replaceAll("\\", "/");
  return relation === "" || relation === ".." || relation.startsWith("../") || isAbsolute(relation)
    ? null
    : relation;
}

function taskInventoryFromSnapshot(
  tasks: z.infer<typeof import("../lib/delivery/authoring-schema.js").DeliveryAuthoringTaskInventorySchema>,
): DeliveryTaskInventory {
  const inventoryDigest = tasks.inventoryDigest;
  assertCanonicalDigest(inventoryDigest);
  return {
    inventoryDigest,
    implementation: tasks.implementation.map((task) => {
      const semanticDigest = task.semanticDigest;
      assertCanonicalDigest(semanticDigest);
      return { taskId: task.taskId, semanticDigest };
    }),
    verificationTaskId: tasks.verificationTaskId,
  };
}

function designInventoryFromSnapshot(
  design: z.infer<typeof import("../lib/delivery/authoring-schema.js").DeliveryAuthoringDesignInventorySchema>,
): BoundDesignInventory {
  return {
    artifacts: design.artifacts.map((artifact) => {
      const revisionDigest = artifact.revisionDigest;
      assertCanonicalDigest(revisionDigest);
      return { artifactId: artifact.artifactId, revisionDigest };
    }),
    elements: design.elements.map((element) => {
      const semanticDigest = element.semanticDigest;
      assertCanonicalDigest(semanticDigest);
      return { elementId: element.elementId, semanticDigest };
    }),
  };
}

function emit(command: string, json: boolean, result: DeliveryCommandResult): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ...result })}\n`);
  } else if (result.status === "ok") {
    process.stdout.write(`${command}: ok\n`);
  } else {
    process.stderr.write(`${command} refused: ${result.reason}\n`);
  }
  if (result.status === "refused") process.exitCode = 1;
}
