/** Strict CLI composition for Candidate applicability selection. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
import { deliveryReviewFixRecordDigest } from "../lib/delivery/review-fix-record-effects.js";
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
  CandidateSubjectUncollectableError,
  collectGitCandidateSubject,
  resolveGitCandidateBaseRevision,
} from "../lib/work-unit/git-candidate-subject.js";
import type { CandidateMutationOwner } from "../lib/work-unit/candidate-mutation-owner.js";
import { RepositoryDeliveryMemberLookup } from
  "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { projectGitReviewContributionApplicability } from
  "../scripts/review-gate/policy/git-review-contribution-applicability.js";
import {
  ReviewApplicabilityResolutionCommandInputSchema,
  ReviewApplicabilityResolutionResultSchema,
  type ReviewApplicabilityResolutionInput,
  resolveReviewApplicability,
  resolveReviewApplicabilityBatch,
  reviewApplicabilityResolutionInputsFromCommand,
} from "../scripts/review-gate/policy/review-applicability-resolution.js";
import {
  checkpointResumeArgv,
  spineRemedy,
  type SpineRemedy,
} from "../scripts/integration/spine-refusal.js";
import {
  resolveCandidateMutationOwner,
  resolveCompletedCandidateWorkUnits,
} from "./candidate-mutation-owner.js";
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
  interaction: InteractionContext | undefined,
  requireMutationOwner: () => Promise<void>,
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
  const currentTarget = async (baseRevision: string) => {
    const collected = await collectGitCandidateSubject({
      cwd: root,
      name,
      baseBranch,
      baseRevision,
      exec: git,
      revision: await readObjectId("HEAD^{commit}"),
    });
    // Applicability is asked to classify one exact target, so a subject it has no reading for is not a
    // classification this resolution can reach — it raises here rather than classifying something else. Under
    // its own type, because the boundary that reports this has to tell it apart from an ordinary failure: the
    // act that clears it is not a rerun of this resolution.
    if (collected.status !== "collected") {
      throw new CandidateSubjectUncollectableError(collected.reason, collected.detail);
    }
    return collected.target;
  };
  const writeRecord = async (
    record: Parameters<typeof writeCandidateRecord>[2],
    expectedVersion: string,
  ): Promise<"written" | "version-conflict"> => {
    await requireMutationOwner();
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
    const requests = reviewApplicabilityResolutionInputsFromCommand(input);
    const memberLookup = new RepositoryDeliveryMemberLookup({ cwd: root, exec: git });
    const context = {
      readRecord: () => readCandidateRecordVersioned(root, name),
      projectApplicability: (selector: ReviewApplicabilityResolutionInput["selector"]) => (
        projectGitReviewContributionApplicability({
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
        })
      ),
      writeRecord,
    };
    const [request] = requests;
    if (request === undefined) throw new Error("Review applicability offer has no projection.");
    resolution = requests.length === 1
      ? await resolveReviewApplicability(context, request)
      : await resolveReviewApplicabilityBatch(context, requests);
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
  await requireMutationOwner();
  await git("git", ["add", "--", recordPath], { cwd: root });
  const staged = (await git("git", ["diff", "--cached", "--name-only", "--", recordPath], {
    cwd: root,
    objectAccess: "local-only",
  })).stdout.trim();
  if (staged === "") return resolution;
  if (resolution.mode === "candidate-applicability-resolve") {
    return { ...resolution, nextAction: "commit-selection" };
  }
  return {
    ...resolution,
    nextAction: "commit-selection",
    recordEffect: {
      path: recordPath,
      digest: deliveryReviewFixRecordDigest(await readFile(resolve(root, recordPath), "utf8")),
    },
  };
}

export interface CandidateApplicabilityResolveHandlerDependencies {
  resolveRoot(): string | null;
  resolveMutationOwner(
    root: string,
    interaction?: InteractionContext,
  ): Promise<CandidateMutationOwner>;
  resolveCompletedWorkUnits(root: string): Promise<readonly string[]>;
  readText(source: string): Promise<string>;
  execute(
    root: string,
    name: string,
    input: CandidateApplicabilityCommandInput,
    interaction: InteractionContext | undefined,
    requireMutationOwner: () => Promise<void>,
  ): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultDependencies(): CandidateApplicabilityResolveHandlerDependencies {
  return {
    resolveRoot: () => requireArcProjectRoot(),
    resolveMutationOwner: (root, interaction) => resolveCandidateMutationOwner({
      cwd: root,
      exec: createGitExec(interaction?.subprocess),
    }),
    resolveCompletedWorkUnits: resolveCompletedCandidateWorkUnits,
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    execute: executeCandidateApplicabilityResolution,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

/**
 * The act that clears a history naming no single base, and the command that composes a fresh selection after it.
 *
 * Re-running this resolution is not the remedy: the selection it binds was derived against the same history and
 * is re-derived against it again. The operator merges the base in by hand, then composes a fresh selection — the
 * integration checkpoint is what produces one, so that is the command this names.
 *
 * @param workUnit - The work unit whose applicability selection stopped.
 * @returns The remedy naming the failed invariant and the command to run once it is satisfied.
 */
function uncollectableSubjectRemedy(workUnit: string): SpineRemedy {
  return spineRemedy(
    "An applicability selection binds what the branch contributes over one base, which a history leaving two "
    + "equally good ancestors does not name.",
    "Merge the configured base into the branch, then compose a fresh selection",
    checkpointResumeArgv(workUnit),
  );
}

/**
 * Close a failed execution, carrying the cause and its clearing act where the failure named one.
 *
 * Most failures here have nothing an operator could act on beyond the stop itself. A subject the branch's
 * history does not name is the exception: the cause is produced one frame away and the act that clears it is
 * not a rerun of this resolution, so both have to survive the boundary rather than dying in the catch.
 *
 * @param error - The failure the execution raised.
 * @param workUnit - The work unit whose resolution stopped.
 * @returns The closed execution-unavailable result.
 */
function executionFailedResult(error: unknown, workUnit: string): CandidateApplicabilityCommandResult {
  return CandidateApplicabilityResolutionResultSchema.parse({
    schemaVersion: 1,
    mode: "candidate-applicability-resolve",
    state: "execution-unavailable",
    nextAction: "stop",
    reason: "execution-failed",
    ...(error instanceof CandidateSubjectUncollectableError
      ? { detail: error.message, remedy: uncollectableSubjectRemedy(workUnit) }
      : {}),
  });
}

function emit(
  deps: CandidateApplicabilityResolveHandlerDependencies,
  result: CandidateApplicabilityCommandResult,
): void {
  deps.write(`${JSON.stringify(result)}\n`);
  if (result.state !== "resolved" && result.state !== "exact-replay") deps.setExitCode(1);
}

type CandidateMutationRefusal = "active-work-unit-mismatch" | "active-work-unit-unavailable";

async function resolveCandidateMutationRefusal(
  deps: CandidateApplicabilityResolveHandlerDependencies,
  root: string,
  workUnit: string,
  interaction?: InteractionContext,
): Promise<CandidateMutationRefusal | null> {
  let owner: CandidateMutationOwner;
  try {
    owner = await deps.resolveMutationOwner(root, interaction);
  } catch {
    return "active-work-unit-unavailable";
  }
  if (owner.status === "unavailable") return "active-work-unit-unavailable";
  if (owner.status === "owned") {
    return owner.workUnit === workUnit ? null : "active-work-unit-mismatch";
  }
  try {
    return (await deps.resolveCompletedWorkUnits(root)).includes(workUnit)
      ? null
      : "active-work-unit-mismatch";
  } catch {
    return "active-work-unit-unavailable";
  }
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
  const mutationRefusal = await resolveCandidateMutationRefusal(
    deps,
    root,
    commandInput.data.name,
    interaction,
  );
  if (mutationRefusal !== null) {
    emit(deps, CandidateApplicabilityResolutionResultSchema.parse({
      schemaVersion: 1,
      mode: "candidate-applicability-resolve",
      state: "execution-unavailable",
      nextAction: "stop",
      reason: mutationRefusal,
    }));
    return;
  }
  const requireMutationOwner = async (): Promise<void> => {
    const refusal = await resolveCandidateMutationRefusal(
      deps,
      root,
      commandInput.data.name,
      interaction,
    );
    if (refusal !== null) throw new Error(`Candidate mutation refused: ${refusal}`);
  };
  let executed: unknown;
  try {
    executed = await deps.execute(
      root,
      commandInput.data.name,
      request,
      interaction,
      requireMutationOwner,
    );
  } catch (error) {
    emit(deps, executionFailedResult(error, commandInput.data.name));
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
