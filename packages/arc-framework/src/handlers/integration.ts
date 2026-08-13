/** CLI adapter for typed integration procedures. */

import { z } from "zod";

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { createGitExec } from "../lib/io-context.js";
import {
  checkpointIntegration,
  IntegrationCheckpointRequestSchema,
  type IntegrationCheckpointResult,
} from "../scripts/integration/checkpoint.js";
import { createIntegrationCheckpointDependencies } from "../scripts/integration/checkpoint-composition.js";
import { requireArcProjectRoot } from "./shared.js";

export const IntegrationCheckpointCommandInputSchema = z.strictObject({
  name: IntegrationCheckpointRequestSchema.shape.workUnit,
});

const integrationCheckpointInputRegistration = {
  commandPath: "integrate checkpoint",
  schema: IntegrationCheckpointCommandInputSchema,
  schemaFields: { "operand.name": "name" },
} satisfies CommandInputRegistration;

const integrationCheckpointJsonPolicy = declareCliOptionSite("json", {
  acquisition: "machine-mode",
  schemaOwnership: "none",
  cancellation: "not-applicable",
  automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
  mutationBoundary: "output selection",
  subprocess: "none",
});

/** Command-input schema registrations owned by integration procedures. */
export const integrationCommandInputRegistrations = [
  integrationCheckpointInputRegistration,
] as const satisfies readonly CommandInputRegistration[];

/** Command-input policy declarations owned by integration procedures. */
export const integrationCommandInputPolicyDeclarations = [{
  commandPath: "integrate checkpoint",
  aliases: [],
  sites: [integrationCheckpointJsonPolicy],
}] as const satisfies readonly CommandInputDeclaration[];

export interface IntegrationCheckpointOptions {
  json?: boolean;
}

export interface IntegrationCheckpointHandlerDependencies {
  checkpoint(cwd: string, workUnit: string): Promise<IntegrationCheckpointResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Run the integration checkpoint for one exact work-unit name. */
export async function handleIntegrationCheckpoint(
  name: string,
  _options: IntegrationCheckpointOptions,
  interaction?: InteractionContext,
  overrides: Partial<IntegrationCheckpointHandlerDependencies> = {},
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: IntegrationCheckpointHandlerDependencies = {
    checkpoint: (root, workUnit) => checkpointIntegration(
      { schemaVersion: 1, workUnit },
      createIntegrationCheckpointDependencies({ cwd: root, exec }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = IntegrationCheckpointCommandInputSchema.safeParse({ name });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "integrate-checkpoint",
      workUnit: name,
      state: "blocked",
      nextAction: "stop",
      reason: "composition-unavailable",
      payload: { detail: parsed.error.issues.map(({ message }) => message).join("; ") },
    })}\n`);
    dependencies.setExitCode(64);
    return;
  }
  dependencies.write(`${JSON.stringify(await dependencies.checkpoint(cwd, parsed.data.name))}\n`);
}
