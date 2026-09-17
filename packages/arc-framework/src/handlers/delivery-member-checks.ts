/** CLI adapter for one-shot delivery-member required-check qualification. */

import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  DeliveryMemberChecksCommandResultSchema,
  DeliveryMemberChecksInputSchema,
  observeDeliveryMemberChecks,
  type DeliveryMemberChecksInput,
  type DeliveryMemberChecksResult,
} from "../scripts/review-gate/delivery-member-checks.js";
import { createGhRequiredChecksPort } from "../scripts/review-gate/hosts/github/checks-await.js";
import { hostedGhRunner } from "../scripts/review-gate/hosted/gh-process.js";
import { spineRemedy } from "../scripts/integration/spine-refusal.js";

const OptionsSchema = z.strictObject({ input: z.string().min(1), json: z.boolean().optional() });

export interface DeliveryMemberChecksOptions {
  readonly input?: string;
  readonly json?: boolean;
}

export const deliveryMemberChecksCommandInputRegistration = {
  commandPath: "delivery checks observe",
  schema: OptionsSchema,
  schemaFields: { "operand.input": "input", "option.json": "json" },
} as const satisfies CommandInputRegistration;

export const deliveryMemberChecksCommandInputPolicyDeclarations = [{
  commandPath: "delivery checks observe",
  aliases: [],
  sites: [
    declareCliOperandSite("input", {
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["<json-path>", "-"] },
      mutationBoundary: "delivery-member check request validation",
      subprocess: "explicit-stdin",
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
    declareInteractionSite(
      { file: "handlers/delivery-member-checks.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin",
        schemaOwnership: "none",
        cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "delivery-member check request read",
        subprocess: "explicit-stdin",
      },
    ),
  ],
}] as const satisfies readonly CommandInputDeclaration[];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface DeliveryMemberChecksHandlerDependencies {
  readText(source: string): Promise<string>;
  observe(input: DeliveryMemberChecksInput): Promise<DeliveryMemberChecksResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultDependencies(): DeliveryMemberChecksHandlerDependencies {
  const port = createGhRequiredChecksPort(hostedGhRunner);
  return {
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    observe: (input) => observeDeliveryMemberChecks(input, {
      port,
      signal: AbortSignal.timeout(30_000),
    }),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

function emit(
  dependencies: DeliveryMemberChecksHandlerDependencies,
  result: z.infer<typeof DeliveryMemberChecksCommandResultSchema>,
  exitCode?: number,
): void {
  dependencies.write(`${JSON.stringify(DeliveryMemberChecksCommandResultSchema.parse(result))}\n`);
  if (exitCode !== undefined) dependencies.setExitCode(exitCode);
}

/** Observe required checks once for one caller-bound delivery member. */
export async function handleDeliveryMemberChecksObserve(
  options: DeliveryMemberChecksOptions,
  overrides: Partial<DeliveryMemberChecksHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  const parsedOptions = OptionsSchema.safeParse(options);
  let decoded: unknown;
  if (parsedOptions.success) {
    try {
      decoded = JSON.parse(await dependencies.readText(parsedOptions.data.input));
    } catch {
      decoded = undefined;
    }
  }
  const parsed = DeliveryMemberChecksInputSchema.safeParse(decoded);
  if (!parsedOptions.success || !parsed.success) {
    let detail = "The delivery-member check request is not valid JSON.";
    if (!parsedOptions.success) {
      detail = parsedOptions.error.issues.map((issue) => issue.message).join("; ");
    } else if (!parsed.success) {
      detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    }
    emit(dependencies, {
      schemaVersion: 1,
      mode: "delivery-member-checks-observe",
      repository: null,
      pullRequest: null,
      headSha: null,
      member: null,
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail: detail || "The delivery-member check request is not valid JSON.",
      remedy: spineRemedy(
        "Delivery-member check observation requires one exact member and change-request head.",
        "Review the command contract, then re-run",
        ["arc", "delivery", "checks", "observe", "--help"],
      ),
    }, 64);
    return;
  }
  try {
    emit(dependencies, await dependencies.observe(parsed.data));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit(dependencies, {
      schemaVersion: 1,
      mode: "delivery-member-checks-observe",
      repository: parsed.data.repository,
      pullRequest: parsed.data.pullRequest,
      headSha: parsed.data.headSha,
      member: parsed.data.member,
      state: "blocked",
      nextAction: "stop",
      reason: "checks-unavailable",
      detail,
      remedy: spineRemedy(
        "Required-check status must be readable for the exact delivery member.",
        "Resolve the host read failure, then re-run",
        ["arc", "delivery", "checks", "observe", parsedOptions.data.input, "--json"],
      ),
    }, 1);
  }
}
