/** Strict CLI composition for Candidate applicability selection. */

import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
} from "../lib/delivery/review-vehicle.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/schema/slug.js";
import {
  CandidateApplicabilityResolutionInputSchema,
  CandidateApplicabilityResolutionResultSchema,
  resolveCandidateApplicability,
} from "../lib/work-unit/candidate-applicability-resolution.js";
import {
  CandidateRecordVersionConflictError,
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../lib/work-unit/candidate-record-store.js";
import { projectGitCandidateApplicability } from "../lib/work-unit/git-candidate-applicability.js";
import {
  collectGitCandidateTarget,
  resolveGitCandidateBaseRevision,
} from "../lib/work-unit/git-candidate-subject.js";
import { RepositoryDeliveryMemberLookup } from
  "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { projectGitReviewContributionApplicability } from
  "../scripts/review-gate/policy/git-review-contribution-applicability.js";
import {
  ReviewApplicabilityResolutionCommandInputSchema,
  ReviewApplicabilityResolutionResultSchema,
  resolveReviewApplicability,
  reviewApplicabilityResolutionInputFromCommand,
} from "../scripts/review-gate/policy/review-applicability-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

const COMMAND_PATH = "candidate applicability resolve";
const CandidateApplicabilityResolveCommandInputSchema = z.strictObject({
  name: SlugSchema,
  input: z.string().min(1),
});

const CandidateApplicabilityCommandInputSchema = z.union([
  CandidateApplicabilityResolutionInputSchema,
  ReviewApplicabilityResolutionCommandInputSchema,
]);
type CandidateApplicabilityCommandInput = z.infer<typeof CandidateApplicabilityCommandInputSchema>;

const CandidateApplicabilityCommandResultSchema = z.union([
  CandidateApplicabilityResolutionResultSchema,
  ReviewApplicabilityResolutionResultSchema,
]);
type CandidateApplicabilityCommandResult = z.infer<typeof CandidateApplicabilityCommandResultSchema>;

export const candidateCommandInputRegistration = {
  commandPath: COMMAND_PATH,
  schema: CandidateApplicabilityResolveCommandInputSchema,
  schemaFields: { "operand.name": "name", "operand.input": "input" },
} satisfies CommandInputRegistration;

export const candidateCommandInputPolicyDeclarations = [{
  commandPath: COMMAND_PATH,
  aliases: [],
  sites: [
    declareCliOperandSite("name", {
      acquisition: "parser-required",
      schemaOwnership: "owned",
      schemaField: "name",
      cancellation: "not-applicable",
      automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["<name>"] },
      mutationBoundary: "Candidate record selection",
      subprocess: "none",
    }),
    declareCliOperandSite("input", {
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["<json-path>", "-"] },
      mutationBoundary: "Candidate applicability request validation",
      subprocess: "explicit-stdin",
    }),
    declareInteractionSite(
      { file: "handlers/candidate.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin",
        schemaOwnership: "none",
        cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "Candidate applicability request read",
        subprocess: "explicit-stdin",
      },
    ),
  ],
}] satisfies readonly CommandInputDeclaration[];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function executeCandidateApplicabilityResolution(
  root: string,
  name: string,
  input: CandidateApplicabilityCommandInput,
  interaction?: InteractionContext,
): Promise<CandidateApplicabilityCommandResult> {
  const { settings } = await readConfigSettings(root);
  const baseBranch = settings["branch.base"];
  const git = createGitExec(interaction?.subprocess);
  const rawGit = createRawGitExec(root);
  const readObjectId = async (expression: string): Promise<string> => (
    await git("git", ["rev-parse", "--verify", expression], {
      cwd: root,
      objectAccess: "local-only",
    })
  ).stdout.trim();
  const currentBase = () => resolveGitCandidateBaseRevision({
    cwd: root,
    baseBranch,
    exec: git,
  });
  const currentTarget = async (baseRevision: string) => collectGitCandidateTarget({
    cwd: root,
    name,
    baseBranch,
    baseRevision,
    exec: git,
    revision: await readObjectId("HEAD^{commit}"),
  });
  const writeRecord = async (
    record: Parameters<typeof writeCandidateRecord>[2],
    expectedVersion: string,
  ): Promise<"written" | "version-conflict"> => {
    try {
      await writeCandidateRecord(root, name, record, expectedVersion);
      return "written";
    } catch (error) {
      if (error instanceof CandidateRecordVersionConflictError) return "version-conflict";
      throw error;
    }
  };

  let resolution: CandidateApplicabilityCommandResult;
  if ("kind" in input) {
    if (input.offer.workUnitId !== name) {
      throw new Error("Review applicability offer belongs to a different work unit.");
    }
    const request = reviewApplicabilityResolutionInputFromCommand(input);
    const memberLookup = new RepositoryDeliveryMemberLookup({ cwd: root, exec: git });
    resolution = await resolveReviewApplicability({
      readRecord: () => readCandidateRecordVersioned(root, name),
      projectApplicability: (selector) => projectGitReviewContributionApplicability({
        selector,
        exec: rawGit,
        observeEndpoints: async () => {
          if (selector.currentVehicle !== undefined) {
            const member = await memberLookup.resolveMemberByHead(selector.currentVehicle.head);
            if (member.status !== "resolved") {
              throw new Error("Current delivery-member applicability coordinates are unavailable.");
            }
            const actualVehicle = DeliveryReviewMemberVehicleSchema.parse({
              kind: "delivery-member",
              planId: member.member.planId,
              deliverableId: member.member.deliverableId,
              workUnitId: member.member.workUnitId,
              head: member.member.head,
            });
            if (!sameDeliveryReviewMemberVehicle(selector.currentVehicle, actualVehicle)) {
              throw new Error("Current delivery-member applicability coordinates changed.");
            }
            return { head: member.member.head, base: member.member.base };
          }
          const [head, base] = await Promise.all([
            readObjectId("HEAD^{commit}"),
            currentBase(),
          ]);
          return { head, base };
        },
      }),
      writeRecord,
    }, request);
  } else {
    resolution = await resolveCandidateApplicability({
      readRecord: () => readCandidateRecordVersioned(root, name),
      currentTarget,
      currentBase,
      projectApplicability: (request) => projectGitCandidateApplicability({
        request,
        exec: rawGit,
        observeEndpoints: async () => {
          const [candidateHead, baseHead] = await Promise.all([
            readObjectId("HEAD^{commit}"),
            currentBase(),
          ]);
          return { candidateHead, baseHead };
        },
      }),
      writeRecord,
    }, input);
  }
  if (resolution.state !== "resolved" && resolution.state !== "exact-replay") return resolution;
  const stagesSelection = resolution.mode === "candidate-applicability-resolve"
    ? resolution.nextAction === "continue"
    : resolution.nextAction === "continue" || resolution.nextAction === "request-review";
  if (!stagesSelection) return resolution;
  const recordPath = resolveCandidateRecordRelativePath(name);
  await git("git", ["add", "--", recordPath], { cwd: root });
  const staged = (await git("git", ["diff", "--cached", "--name-only", "--", recordPath], {
    cwd: root,
    objectAccess: "local-only",
  })).stdout.trim();
  return staged === "" ? resolution : { ...resolution, nextAction: "commit-selection" };
}

export interface CandidateApplicabilityResolveHandlerDependencies {
  resolveRoot(): string | null;
  readText(source: string): Promise<string>;
  execute(
    root: string,
    name: string,
    input: CandidateApplicabilityCommandInput,
    interaction?: InteractionContext,
  ): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultDependencies(): CandidateApplicabilityResolveHandlerDependencies {
  return {
    resolveRoot: () => requireArcProjectRoot(),
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    execute: executeCandidateApplicabilityResolution,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

function emit(
  deps: CandidateApplicabilityResolveHandlerDependencies,
  result: CandidateApplicabilityCommandResult,
): void {
  deps.write(`${JSON.stringify(result)}\n`);
  if (result.state !== "resolved" && result.state !== "exact-replay") deps.setExitCode(1);
}

/** Parse one exact-bound selection request and emit its closed resolution result. */
export async function handleCandidateApplicabilityResolve(
  name: string,
  input: string,
  interaction?: InteractionContext,
  overrides: Partial<CandidateApplicabilityResolveHandlerDependencies> = {},
): Promise<void> {
  const deps = { ...defaultDependencies(), ...overrides };
  const commandInput = CandidateApplicabilityResolveCommandInputSchema.safeParse({ name, input });
  if (!commandInput.success) {
    emit(deps, CandidateApplicabilityResolutionResultSchema.parse({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "invalid-input",
      nextAction: "correct-input",
    }));
    return;
  }
  const root = deps.resolveRoot();
  if (root === null) {
    emit(deps, CandidateApplicabilityResolutionResultSchema.parse({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "project-root-unavailable",
    }));
    return;
  }
  let request: CandidateApplicabilityCommandInput;
  try {
    request = CandidateApplicabilityCommandInputSchema.parse(
      JSON.parse(await deps.readText(commandInput.data.input)),
    );
  } catch {
    emit(deps, CandidateApplicabilityResolutionResultSchema.parse({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "invalid-input",
      nextAction: "correct-input",
    }));
    return;
  }
  let executed: unknown;
  try {
    executed = await deps.execute(root, commandInput.data.name, request, interaction);
  } catch {
    emit(deps, CandidateApplicabilityResolutionResultSchema.parse({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "execution-failed",
    }));
    return;
  }
  const parsed = CandidateApplicabilityCommandResultSchema.safeParse(executed);
  emit(deps, parsed.success ? parsed.data : CandidateApplicabilityResolutionResultSchema.parse({
    schemaVersion: 1,
    mode: "candidate-applicability-resolve",
    state: "execution-unavailable",
    nextAction: "stop",
    reason: "invalid-service-result",
  }));
}
