/** CLI adapters for the delivery authoring spine. */

import { z } from "zod";

import { readConfigSettings } from "../lib/config/status-reader.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import {
  DeliveryAuthoringManager,
  resolveExistingDeliveryAuthoringMap,
} from "../lib/delivery/authoring-resolution.js";
import { validateDeliveryAuthoringMap } from "../lib/delivery/authoring-map.js";
import { RepositoryDeliveryAuthoringStore } from "../lib/delivery/authoring-store.js";
import { RepositoryDeliveryPlanStore } from "../lib/delivery/local-stores.js";
import { GitDeliveryRenameTransitionSource } from "../lib/delivery/plan-resolution.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { createGitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

const DeliveryComposeInputSchema = z.strictObject({ json: z.boolean().optional() });
const DeliveryPlanAbandonInputSchema = z.strictObject({ json: z.boolean().optional() });

export interface DeliveryComposeOptions { readonly json?: boolean }
export interface DeliveryPlanAbandonOptions { readonly json?: boolean }

/** Machine-output policies owned by the delivery command family. */
export const deliveryCommandInputPolicyDeclarations = [
  deliveryJsonPolicy("delivery compose"),
  deliveryJsonPolicy("delivery plan abandon"),
] as const satisfies readonly CommandInputDeclaration[];

function deliveryJsonPolicy(commandPath: string): CommandInputDeclaration {
  return {
    commandPath,
    aliases: [],
    sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "none",
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
    const cleanup = await context.authoringStore.deleteSnapshot(resolution.record.snapshot.mapId);
    emit("delivery compose", parsed.data.json === true, cleanup.status === "refused"
      ? cleanup
      : { status: "ok", value: { planDigest: receipt, recoveredCleanup: true } });
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
  emit("delivery compose", parsed.data.json === true, {
    status: "refused",
    reason: "authoring-entry-projection-unavailable",
  });
}

/** Abandon the rename-resolved singleton map and tolerate already-absent or torn state. */
export async function handleDeliveryPlanAbandon(
  opts: DeliveryPlanAbandonOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = DeliveryPlanAbandonInputSchema.safeParse(opts);
  if (!parsed.success) {
    emit("delivery plan abandon", false, {
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
    workUnitId: active.name,
    authority,
    authoringStore: new RepositoryDeliveryAuthoringStore(publisher),
    planStore: new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec),
    transitionSource: new GitDeliveryRenameTransitionSource(exec),
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
