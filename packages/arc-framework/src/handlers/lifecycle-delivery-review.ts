/** Candidate attestation, publication review boundaries, and delivery withdrawal checks. */

import * as p from "../lib/terminal.js";
import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import { formatValue, parseMetaRecord, setMetaBulletFields, setMetaCandidate } from "../lib/active/meta-reader.js";
import { checkCurrentWorkflowConsistency } from "../lib/active/current-workflow-consistency.js";
import { resolveTaskListPath } from "../commands/active.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { canonicalize } from "../lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../lib/kernel/schema/vocabulary.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../scripts/review-gate/hosts/local/operation-state-store.js";
import {
  resolveRepositoryIdentity,
  withRepositoryReviewOperationLock,
} from "../scripts/review-gate/hosts/local/git-common-state.js";
import {
  laneContinuationOperationId,
  readLaneProgressOwner,
  readLaneProgressOwnerVersioned,
} from "../scripts/review-gate/lane-progress.js";
import { livePredecessorReviewAttempt } from "../scripts/review-gate/lane-progress-supersession.js";
import { createRawGitExec } from "../lib/io-context.js";
import { materializeArcPath, resolveArcPath } from "../lib/layout/index.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { runPublish } from "../lib/work-unit/verbs/publish.js";
import { AttestResultSchema, runAttest, type AttestContext } from "../lib/work-unit/verbs/attest.js";
import { CandidateVerificationEvidenceRefSchema } from
  "../lib/work-unit/candidate-attestation.js";
import {
  collectGitCandidateSubject,
  collectUnstagedReviewablePaths,
} from "../lib/work-unit/git-candidate-subject.js";
import {
  readCandidateRecord,
  readCandidateRecordVersioned,
  readRepositoryCandidateRecordRevision,
  writeCandidateRecord,
} from "../lib/work-unit/candidate-record-store.js";
import { projectGitCandidateEffectiveTarget } from "../lib/work-unit/git-candidate-effective-target.js";
import {
  inspectRepositoryDeliveryCandidateRenewal,
  inspectRepositoryDeliveryReopen,
} from "../lib/delivery/repository-entry.js";
import {
  resolveLastCompletedTask,
  resolveTaskListCursor,
} from "../lib/task-list/cursor.js";
import {
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../lib/work-unit/submission-boundary-store.js";
import {
  projectCandidateReviewBoundary,
  projectCandidateReviewResumeBoundary,
  projectCorrectiveDeliveryStatusBoundary,
  recoverAttestedOwnerTerminusBoundary,
  recoverAttestedSingletonPublicationBoundary,
  type IntegrationBoundaryLocus,
} from "../scripts/review-gate/policy/integration-boundary-locus.js";
import { attestArgv, attestNewRootArgv, spineRemedy } from "../scripts/integration/spine-refusal.js";
import { SlugSchema, validateManagedPath } from "../lib/kernel/index.js";
import { type InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import type { PublishOptions } from "./lifecycle.js";
import {
  buildExecutor,
  lifecycleFs,
  parseLifecycleCommand,
  projectActiveMetaPath,
  refuse,
  refuseWithRemedy,
  reportOutcome,
  resolveVerbBase,
  type VerbBase,
} from "./lifecycle-shared.js";

class DeliveryCandidateRenewalRefusal extends Error {}

class CandidateReviewRecoveryRefusal extends Error {}

/** Name a bounded sample of paths so a wide refusal stays readable without hiding its scale. */
function summarizePaths(paths: readonly string[], limit = 5): string {
  const shown = paths.slice(0, limit).map((path) => `\`${path}\``).join(", ");
  return paths.length <= limit ? shown : `${shown}, and ${paths.length - limit} more`;
}

/** Schema-owned Candidate attestation input. */
export const AttestCommandInputSchema = z.object({
  name: SlugSchema,
  json: z.boolean().optional(),
  newRoot: z.boolean().optional(),
  scope: z.enum(["focused", "full"]).default("full"),
  verificationEvidenceRef: CandidateVerificationEvidenceRefSchema.optional(),
  expectedCandidate: CanonicalDigestSchema.optional(),
  expectedSubject: CanonicalDigestSchema.optional(),
}).strict().superRefine((value, refinement) => {
  if ((value.expectedCandidate === undefined) !== (value.expectedSubject === undefined)) {
    refinement.addIssue({
      code: "custom",
      path: [value.expectedCandidate === undefined ? "expectedCandidate" : "expectedSubject"],
      message: "--expected-candidate and --expected-subject must be supplied together.",
    });
  }
  if ((value.expectedCandidate !== undefined || value.expectedSubject !== undefined) && value.newRoot !== true) {
    refinement.addIssue({
      code: "custom",
      path: ["newRoot"],
      message: "Bound re-root selectors require --new-root.",
    });
  }
});

/** Options for Candidate attestation. */
export interface AttestOptions {
  json?: boolean;
  newRoot?: boolean;
  scope?: "focused" | "full";
  verificationEvidenceRef?: string;
  expectedCandidate?: string;
  expectedSubject?: string;
}

/** Attest the current verified work-unit subject without changing lifecycle State. */
function convergenceResumeAfterAttest(
  existingBoundary: IntegrationBoundaryLocus | null,
  publication: Parameters<AttestContext["publish"]>[0],
  boundaryMatches: boolean,
): IntegrationBoundaryLocus | null {
  if (existingBoundary === null || !boundaryMatches
    || existingBoundary.locus !== "candidate-convergence-verification-pending") return null;
  return projectCandidateReviewResumeBoundary({
    workUnit: publication.name,
    candidateId: publication.candidateId,
    candidateSubjectDigest: publication.candidateSubjectDigest,
    reservation: existingBoundary.reservation,
    terminus: existingBoundary.terminus,
    deliveryReviewTermini: existingBoundary.deliveryReviewTermini,
    postAttestContinuation: existingBoundary.nextAction.postAttestContinuation,
  });
}

/**
 * Attest the verified Candidate without changing lifecycle state.
 * @param name - Work-unit slug to attest.
 * @param opts - Candidate selectors and output options.
 * @param context - Optional interaction and subprocess context.
 * @returns Resolves after reporting the attestation result.
 */
export async function handleAttest(
  name: string | undefined,
  opts: AttestOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc attest");
  const input = parseLifecycleCommand(
    AttestCommandInputSchema,
    {
      name: name?.trim(),
      json: opts.json,
      newRoot: opts.newRoot,
      scope: opts.scope,
      verificationEvidenceRef: opts.verificationEvidenceRef,
      expectedCandidate: opts.expectedCandidate,
      expectedSubject: opts.expectedSubject,
    },
    ["attest"],
    opts.json === true,
  );
  if (input === null) return;
  const base = await resolveVerbBase(context, input.json === true);
  if (base === null) return;
  const { settings } = await buildExecutor(base);
  let metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: input.name,
    artifact: "meta",
  });
  let absoluteMetaPath = materializeArcPath(base.cwd, metaPath);
  let metaContent: string;
  try {
    metaContent = await base.io.readFile(absoluteMetaPath);
  } catch {
    const archived = (await buildLifecycleIndex({ cwd: base.cwd, fs: lifecycleFs })).get(input.name);
    if (input.newRoot !== true || archived?.location !== "completed") {
      refuseWithRemedy(
        `\`arc attest\` requires an active record, or an archived record with \`--new-root\`, for \`${input.name}\`.`,
        spineRemedy(
          "Candidate attestation requires a resolvable work-unit record.",
          "Inspect the work-unit lifecycle state",
          ["arc", "status", input.name, "--json"],
        ),
        input.json === true,
      );
      return;
    }
    metaPath = validateManagedPath(archived.path);
    absoluteMetaPath = materializeArcPath(base.cwd, metaPath);
    metaContent = await base.io.readFile(absoluteMetaPath);
  }
  const meta = parseMetaRecord(metaContent);
  if (meta.state !== "Active" && meta.state !== "Integrating" && !(meta.state === "Shipped" && input.newRoot === true)) {
    refuseWithRemedy(
      `\`arc attest\` requires \`${input.name}\` to be Active or Integrating, or Shipped with \`--new-root\`.`,
      spineRemedy(
        "Candidate attestation runs only from an active publication lifecycle.",
        "Inspect the work-unit lifecycle state",
        ["arc", "status", input.name, "--json"],
      ),
      input.json === true,
    );
    return;
  }
  let lastCompleted: string | null = null;
  const taskListPath = resolveTaskListPath(metaPath, meta.taskList);
  if (taskListPath === null) {
    refuseWithRemedy(
      `\`arc attest\` requires a canonical task-list binding for \`${input.name}\`.`,
      spineRemedy(
        "Candidate attestation requires a resolvable, structurally closed task list.",
        "Restore the task-list binding and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  let taskList: string;
  try {
    taskList = await base.io.readFile(materializeArcPath(base.cwd, validateManagedPath(taskListPath)));
  } catch {
    refuseWithRemedy(
      `\`arc attest\` requires the canonical task list for \`${input.name}\` to be readable.`,
      spineRemedy(
        "Candidate attestation requires a resolvable, structurally closed task list.",
        "Restore the task list and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  const taskCursor = resolveTaskListCursor(taskList);
  if (taskCursor.status === "malformed") {
    refuseWithRemedy(
      `\`arc attest\` cannot use the malformed task list for \`${input.name}\` at line `
        + `${taskCursor.error.line}: ${taskCursor.error.message}`,
      spineRemedy(
        "Candidate attestation requires a structurally closed task list.",
        "Repair the task-list structure and close execution before attesting",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  if (taskCursor.status === "found") {
    const current = `Task ${taskCursor.cursor.leaf.id} — ${taskCursor.cursor.leaf.title}`;
    refuseWithRemedy(
      `\`arc attest\` cannot attest \`${input.name}\` while task remains open: ${current}.`,
      spineRemedy(
        "Candidate attestation begins only after canonical task execution is closed.",
        "Complete the current task and work-unit verification, then attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }
  const terminal = resolveLastCompletedTask(taskList);
  if (terminal.status === "found") {
    lastCompleted = `Task ${terminal.item.id} — ${terminal.item.title}`;
  }
  const boundarySnapshot = await readSubmissionBoundaryVersioned(base.cwd, input.name);
  let deliveryRenewal: Awaited<ReturnType<typeof inspectRepositoryDeliveryCandidateRenewal>> = {
    status: "not-applicable",
  };
  if (meta.state === "Integrating" || meta.state === "Shipped") {
    try {
      deliveryRenewal = await inspectRepositoryDeliveryCandidateRenewal({
        cwd: base.cwd,
        taskListPath: validateManagedPath(taskListPath),
        workUnitId: input.name,
        baseBranch: settings["branch.base"],
        exec: base.io.exec,
        sourceBoundary: boundarySnapshot.boundary,
      });
    } catch {
      deliveryRenewal = { status: "refused", reason: "evidence-unavailable" };
    }
    if (deliveryRenewal.status === "refused") {
      refuseWithRemedy(
        `\`arc attest\` cannot establish exact public delivery Candidate renewal evidence for \`${input.name}\` `
          + `(${deliveryRenewal.reason}).`,
        spineRemedy(
          "Corrective attestation must preserve the exact public Candidate, plan, state, member, and review binding.",
          "Restore the exact public delivery continuation before attesting",
          input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
        ),
        input.json === true,
      );
      return;
    }
  }

  const unstaged = await collectUnstagedReviewablePaths({
    cwd: base.cwd,
    name: input.name,
    exec: base.io.exec,
  });
  if (unstaged.length > 0) {
    refuseWithRemedy(
      `\`arc attest\` attests the staged subject, and ${unstaged.length} reviewable path(s) hold `
        + `working-tree content the index does not carry: ${summarizePaths(unstaged)}.`,
      spineRemedy(
        "A Candidate attests the staged subject, so every verified reviewable change must be staged first.",
        "Stage the verified content, then re-attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }

  // Read here rather than inside attestation's own target dependency: every refusal attestation returns names
  // a Candidate and the subject digest it was measured against, and a subject that was never collected has
  // neither. What blocks it is the shape of the branch's history — the same kind of condition as the checks
  // above, and like them it clears by hand and leaves the same command to re-run.
  const subject = await collectGitCandidateSubject({
    cwd: base.cwd,
    name: input.name,
    baseBranch: settings["branch.base"],
    exec: base.io.exec,
  });
  if (subject.status !== "collected") {
    refuseWithRemedy(
      `\`arc attest\` cannot derive \`${input.name}\`'s subject from a single base `
        + `(${subject.reason}): ${subject.detail}`,
      spineRemedy(
        "A Candidate attests what the branch contributes over one base, which a history leaving two equally "
          + "good ancestors does not name.",
        "Merge the configured base into the branch, then re-attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }

  let result: Awaited<ReturnType<typeof runAttest>>;
  try {
    result = await runAttest({
      actor: base.identity,
      now: () => new Date().toISOString(),
      verificationEvidenceRef: (slug) => `tasks-${slug}.md#verification`,
      readRecord: (slug) => readCandidateRecordVersioned(base.cwd, slug),
      currentTarget: () => Promise.resolve(subject.target),
      effectiveTarget: (slug, record) => projectGitCandidateEffectiveTarget({
        cwd: base.cwd,
        name: slug,
        baseBranch: settings["branch.base"],
        record,
        exec: base.io.exec,
        rawExec: createRawGitExec(base.cwd),
      }),
      inspectReRootReviewAuthority: async (_slug, candidateId) => {
        const publisher = new RepositoryGitCommonStatePublisher(base.io.exec, base.cwd);
        const store = new LocalReviewOperationStateStore(publisher);
        const repositoryId = await resolveRepositoryIdentity(publisher);
        for (const lane of ["frontline", "standard"] as const) {
          const owner = await readLaneProgressOwner(store, {
            lane, repositoryId, headSha: subject.target.revision,
            lineage: { kind: "candidate", candidateId },
          });
          if (owner === null) continue;
          const live = livePredecessorReviewAttempt(owner);
          if (live !== null) {
            let recordRevision: string;
            try {
              recordRevision = await readRepositoryCandidateRecordRevision({
                cwd: base.cwd, workUnit: input.name, candidateId,
                reviewHeadSha: live.reviewHeadSha, exec: base.io.exec,
              });
            } catch (error) {
              throw new CandidateReviewRecoveryRefusal(
                error instanceof Error ? error.message : String(error),
              );
            }
            return { lane, ...live, recordRevision };
          }
        }
        return null;
      },
      publish: async (publication) => {
        let deliveryLocus: ReturnType<typeof projectCorrectiveDeliveryStatusBoundary> | null = null;
        if (deliveryRenewal.status === "ready") {
          const fresh = await inspectRepositoryDeliveryCandidateRenewal({
            cwd: base.cwd,
            taskListPath: validateManagedPath(taskListPath),
            workUnitId: input.name,
            baseBranch: settings["branch.base"],
            exec: base.io.exec,
            sourceBoundary: boundarySnapshot.boundary,
          });
          if (fresh.status !== "ready") {
            throw new DeliveryCandidateRenewalRefusal(
              fresh.status === "refused" ? fresh.reason : "delivery evidence disappeared",
            );
          }
          if (boundarySnapshot.boundary === null) {
            throw new DeliveryCandidateRenewalRefusal("public delivery boundary disappeared");
          }
          try {
            deliveryLocus = projectCorrectiveDeliveryStatusBoundary({
              workUnit: publication.name,
              candidateId: publication.candidateId,
              candidateSubjectDigest: publication.candidateSubjectDigest,
              supersedesCandidateId: publication.record.attestation.supersedes ?? null,
              sourceBoundary: boundarySnapshot.boundary,
              deliveryContinuation: fresh.deliveryContinuation,
            });
          } catch (error) {
            throw new DeliveryCandidateRenewalRefusal(
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        const recordPath = await writeCandidateRecord(
          base.cwd,
          publication.name,
          publication.record,
          publication.expectedRecordVersion,
        );
        const priorMeta = parseMetaRecord(metaContent);
        const existingBoundary = boundarySnapshot.boundary;
        const boundaryMatches = existingBoundary !== null
          && existingBoundary.candidateId === publication.candidateId
          && existingBoundary.candidateSubjectDigest === publication.candidateSubjectDigest;
        const convergenceResume = convergenceResumeAfterAttest(existingBoundary, publication, boundaryMatches);
        const ownerTerminusContinuation = recoverAttestedOwnerTerminusBoundary({
          stored: existingBoundary,
          workUnit: publication.name,
          candidateId: publication.candidateId,
          candidateSubjectDigest: publication.candidateSubjectDigest,
          repairCurrent: publication.repairCurrent,
        });
        const singletonPublication = recoverAttestedSingletonPublicationBoundary({
          stored: existingBoundary,
          workUnit: publication.name,
          candidateId: publication.candidateId,
          candidateSubjectDigest: publication.candidateSubjectDigest,
          integrating: priorMeta.state === "Integrating",
        });
        const locus = deliveryLocus ?? ownerTerminusContinuation ?? convergenceResume
          ?? singletonPublication
          ?? (publication.repairCurrent && boundaryMatches
            ? existingBoundary
            : projectCandidateReviewBoundary({
                workUnit: publication.name,
                candidateId: publication.candidateId,
                candidateSubjectDigest: publication.candidateSubjectDigest,
              }));
        const withCandidate = setMetaCandidate(metaContent, publication.candidateId);
        const orientation: Record<string, string> = {};
        if (!publication.repairCurrent || priorMeta.currentWorkflow !== publication.currentWorkflow) {
          orientation["Current Workflow"] = formatValue(publication.currentWorkflow, "identifier");
        }
        const nextAction = locus === singletonPublication
          ? locus.nextAction.interactionText
          : boundaryMatches || priorMeta.state === "Shipped" ? publication.nextAction : locus.nextAction.interactionText;
        if (!publication.repairCurrent || !boundaryMatches || priorMeta.nextAction === null) {
          orientation["Next Action"] = formatValue(nextAction, "narrative");
        }
        if (lastCompleted !== null && (!publication.repairCurrent || priorMeta.lastCompleted === null)) {
          orientation["Last Completed"] = formatValue(lastCompleted, "narrative");
        }
        if (priorMeta.nextTask !== null) {
          orientation["Next Task"] = "[none]";
        }
        metaContent = Object.keys(orientation).length === 0
          ? withCandidate
          : setMetaBulletFields(withCandidate, orientation);
        const workflowDiagnostics = checkCurrentWorkflowConsistency(parseMetaRecord(metaContent));
        if (workflowDiagnostics.length > 0) throw new Error(workflowDiagnostics[0]);
        const boundaryPath = await writeSubmissionBoundary(
          base.cwd,
          locus,
          boundarySnapshot.version,
        );
        await base.io.writeFile(absoluteMetaPath, metaContent);
        await base.io.exec("git", ["add", "--", recordPath, metaPath, boundaryPath], { cwd: base.cwd });
        return { recordPath, metaPath, locus };
      },
    }, {
      name: input.name,
      lifecycle: meta.state,
      newRoot: input.newRoot === true,
      scope: input.scope,
      verificationEvidenceRef: input.verificationEvidenceRef,
      ...(input.expectedCandidate === undefined || input.expectedSubject === undefined
        ? {}
        : {
            expectedBlocked: {
              candidateId: input.expectedCandidate,
              subjectDigest: input.expectedSubject,
            },
          }),
    });
  } catch (error) {
    if (error instanceof CandidateReviewRecoveryRefusal) {
      refuseWithRemedy(
        `\`arc attest\` cannot bind the live review to its Candidate record: ${error.message}`,
        spineRemedy(
          "The review-owning Candidate record must be verified at the exact live review head before re-root.",
          "Restore that review head and its managed Candidate record in local Git history, then retry re-root",
          input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
        ),
        input.json === true,
      );
      return;
    }
    if (!(error instanceof DeliveryCandidateRenewalRefusal)) throw error;
    refuseWithRemedy(
      `\`arc attest\` refused stale or mismatched public delivery Candidate renewal for \`${input.name}\`: `
        + error.message,
      spineRemedy(
        "Corrective attestation writes only one exact version-bound public member-review continuation.",
        "Restore the exact public Candidate, plan, state, member, and review evidence, then re-attest",
        input.newRoot === true ? attestNewRootArgv(input.name) : attestArgv(input.name),
      ),
      input.json === true,
    );
    return;
  }

  if (result.status === "unchanged") {
    const currentBoundary = await readSubmissionBoundaryVersioned(base.cwd, input.name);
    if (currentBoundary.boundary?.candidateId !== result.locus.candidateId
      || currentBoundary.boundary.candidateSubjectDigest !== result.locus.candidateSubjectDigest) {
      const boundaryPath = await writeSubmissionBoundary(
        base.cwd,
        result.locus,
        currentBoundary.version,
      );
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    }
  }

  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(AttestResultSchema.parse(result))}\n`);
  } else if (result.status === "blocked") {
    p.log.error(`${result.recommendedActionText}\n${JSON.stringify(result.delta)}`);
  } else if (result.status === "refused") {
    if (result.reason === "re-root-live-review") {
      p.log.error([
        result.recommendedActionText,
        `Candidate: ${result.candidateId}`,
        `Live ${result.lane} attempt: ${result.attemptId} (${result.outcome})`,
        `Review head: ${result.reviewHeadSha}`,
        `Predecessor Candidate record commit: ${result.recordRevision}`,
        `Next after restoring this owning checkout to the review head: ${result.nextAction.reviewArgv.join(" ")}`,
      ].join("\n"));
    } else if ("expected" in result) {
      p.log.error([
        result.recommendedActionText,
        `Reason: ${result.reason}`,
        `Expected Candidate: ${result.expected.candidateId}`,
        `Observed Candidate: ${result.observed.candidateId ?? "[none]"}`,
        `Expected Subject: ${result.expected.subjectDigest}`,
        `Observed Subject: ${result.observed.subjectDigest}`,
        `Next: ${result.nextAction.attestArgv.join(" ")}`,
      ].join("\n"));
    } else {
      p.log.error([
        result.recommendedActionText,
        `Candidate: ${result.candidateId ?? "[none]"}`,
        `Subject: ${result.subjectDigest}`,
        `Scope: ${result.requestedScope} requested; ${result.requiredScope} required`,
        `Fresh evidence: ${result.verificationEvidenceProvided ? "supplied" : "missing"}`,
        ...(result.nextAction.verificationEvidenceRequired
          ? []
          : [`Operation: ${result.nextAction.operation}`]),
        `Next: ${result.nextAction.attestArgv.join(" ")}`,
      ].join("\n"));
    }
  } else {
    const lines = [
      `Work unit: ${result.locus.workUnit}`,
      `Candidate: ${result.locus.candidateId}`,
      `Locus:     ${result.locus.locus}`,
    ];
    if ("operation" in result && result.operation === "convergence") {
      lines.push(`Scope:     ${result.scope}`);
      lines.push(`Evidence:  ${result.verificationEvidenceRef}`);
    }
    p.note(lines.join("\n"), result.status === "unchanged" ? "Candidate unchanged" : "Candidate attested");
    p.outro("Done.");
  }
  if (result.status === "blocked" || result.status === "refused") process.exitCode = 1;
}

/**
 * Publish a lifecycle transition with its exact Candidate and review boundary.
 * @param base - Resolved checkout, identity, and I/O.
 * @param target - Work-unit slug selected by the lifecycle handler.
 * @param input - Validated publication options.
 * @returns Resolves after reporting the publication result.
 */
export async function publishCandidateWithReviewBoundary(
  base: VerbBase,
  target: string,
  input: PublishOptions,
): Promise<void> {
  const { lastCompleted, action } = input;

  const { executor, settings } = await buildExecutor(base);
  const rawGit = createRawGitExec(base.cwd);
  const readCandidateAuthorization = async () => {
    const record = await readCandidateRecord(base.cwd, target);
    if (record === null) return null;
    const effective = await projectGitCandidateEffectiveTarget({
      cwd: base.cwd,
      name: target,
      baseBranch: settings["branch.base"],
      record,
      exec: base.io.exec,
      rawExec: rawGit,
    });
    const candidateSubjectDigest = effective.state === "current"
      ? effective.recognizedTarget.subject.subjectDigest
      : effective.state === "changed" || effective.state === "staged-change"
        ? effective.currentTarget.subject.subjectDigest
        : effective.currentTarget.subjectDigest;
    return {
      record,
      candidateId: record.attestation.candidateId,
      candidateSubjectDigest,
      candidateCurrent: effective.state === "current"
        && effective.convergenceVerification === "satisfied",
    };
  };
  const candidate = await readCandidateAuthorization();
  if (candidate === null) {
    refuseWithRemedy(
      `Cannot publish \`${target}\`: no managed Candidate record exists.`,
      spineRemedy(
        "Submission requires a managed Candidate attestation.",
        "Attest the candidate",
        ["arc", "attest", target],
      ),
      input.json === true,
    );
    return;
  }
  const record = candidate.record;
  const publisher = new RepositoryGitCommonStatePublisher(base.io.exec, base.cwd);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const currentHead = async () => (await base.io.exec("git", ["rev-parse", "HEAD"], {
    cwd: base.cwd,
  })).stdout.trim();
  const readStandardLaneOwnerVersion = async () => (await readLaneProgressOwnerVersioned(operationStore, {
    lane: "standard", repositoryId, headSha: await currentHead(),
    lineage: { kind: "candidate", candidateId: candidate.candidateId },
  })).version;
  const boundarySnapshot = await readSubmissionBoundaryVersioned(base.cwd, target);
  const boundary = boundarySnapshot.boundary;
  if (boundary === null) {
    refuseWithRemedy(
      `Cannot publish \`${target}\`: no durable pre-publication boundary exists.`,
      spineRemedy(
        "Submission requires a settled pre-publication boundary.",
        "Resolve the pre-publication lanes",
        ["arc", "review", "pre-publication", target],
      ),
      input.json === true,
    );
    return;
  }
  const result = await withRepositoryReviewOperationLock(
    base.io.exec, base.cwd,
    laneContinuationOperationId({
      lane: "standard", repositoryId, headSha: await currentHead(),
      lineage: { kind: "candidate", candidateId: candidate.candidateId },
    }),
    10_000, () => runPublish(executor, {
    name: target,
    ...(lastCompleted === undefined ? {} : { lastCompleted }),
    ...(action === undefined ? {} : { nextAction: action }),
    candidateId: candidate.candidateId,
    candidateSubjectDigest: candidate.candidateSubjectDigest,
    candidateCurrent: candidate.candidateCurrent,
    boundary,
    refreshCandidateAuthorization: async () => {
      const refreshed = await readCandidateAuthorization();
      if (refreshed === null) {
        return {
          candidateId: record.attestation.candidateId,
          candidateSubjectDigest: candidate.candidateSubjectDigest,
          candidateCurrent: false,
        };
      }
      return refreshed;
    },
    readStandardLaneOwnerVersion,
    claimPublicationBoundary: async (publicationBoundary) => {
      if ((boundary.locus === "candidate-publish-ready" || boundary.locus === "publication-pending")
        && boundary.standardLaneOwnerVersion !== await readStandardLaneOwnerVersion()) {
        throw new Error("standard review progress changed after publication readiness was recorded");
      }
      const boundaryPath = await writeSubmissionBoundary(
        base.cwd,
        publicationBoundary,
        boundarySnapshot.version,
      );
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    },
    ...(input.allowAdvisories === true ? { allowAdvisories: true } : {}),
  }));
  if (result.status === "rejected") {
    refuseWithRemedy(result.reason, result.remedy, input.json === true);
    return;
  }
  if (result.status === "unchanged") {
    if (canonicalize(result.boundary) !== canonicalize(boundary)) {
      const boundaryPath = await writeSubmissionBoundary(base.cwd, result.boundary, boundarySnapshot.version);
      await base.io.exec("git", ["add", "--", boundaryPath], { cwd: base.cwd });
    }
    if (input.json === true) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      p.note(
        `Work unit: ${target}\nLocus:     ${result.boundary.locus}\nNext:      ${result.boundary.nextAction.command}`,
        "Submission unchanged",
      );
    }
    return;
  }
  if (result.status === "reconcile-failed") {
    refuseWithRemedy(result.reason, result.remedy, input.json === true);
    return;
  }
  if (result.status === "reconcile-pending") {
    if (input.json === true) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
    } else {
      for (const advisory of result.reconcile.prepared.plan.advisories) {
        p.log.info(
          `Reconcile advisory: ${advisory.path}:${advisory.line} — `
          + `${advisory.referenceKind} reference to \`${advisory.subject}\`; `
          + `${advisory.suggestedDisposition}. Context: ${advisory.context}`,
        );
      }
      refuseWithRemedy(result.reason, result.remedy);
    }
    return;
  }
  if (result.reconcile.status === "pending" && input.json !== true) {
    for (const advisory of result.reconcile.prepared.plan.advisories) {
      p.log.info(
        `Accepted reconcile advisory: ${advisory.path}:${advisory.line} — `
        + `${advisory.referenceKind} reference to \`${advisory.subject}\`; `
        + `${advisory.suggestedDisposition}. Context: ${advisory.context}`,
      );
    }
  }
  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  reportOutcome("Integrating", [`Work unit: ${target}`, `Meta:      ${result.metaPath}`], result.outcome);
}

/**
 * Check exact delivery composition before a lifecycle withdrawal.
 * @param base - Resolved checkout, identity, and I/O.
 * @param target - Work-unit slug selected by the lifecycle handler.
 * @param settings - Configuration read for lifecycle execution.
 * @returns Whether the delivery composition permits ordinary reopen.
 */
export async function permitDeliveryReopen(
  base: VerbBase,
  target: string,
  settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"],
): Promise<boolean> {
  const metaPath = projectActiveMetaPath(target);
  let taskListPath: string | null;
  try {
    const meta = parseMetaRecord(await base.io.readFile(materializeArcPath(base.cwd, metaPath)));
    taskListPath = resolveTaskListPath(metaPath, meta.taskList);
  } catch {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the active metadata is unavailable.");
    return false;
  }
  if (taskListPath === null) {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the canonical task-list binding is unavailable.");
    return false;
  }
  let delivery;
  try {
    delivery = await inspectRepositoryDeliveryReopen({
      cwd: base.cwd,
      taskListPath,
      workUnitId: target,
      baseBranch: settings["branch.base"],
      exec: base.io.exec,
    });
  } catch {
    refuse(`Ordinary reopen cannot establish exact delivery composition for \`${target}\`: `
      + "the plan, state, or transition evidence is unavailable.");
    return false;
  }
  if (delivery.status !== "reopen-permitted") {
    refuse(delivery.recommendedActionText);
    return false;
  }

  return true;
}

/** Command-owned Candidate attestation input. */
export const attestCommandInputRegistration = {
    commandPath: "attest",
    schema: AttestCommandInputSchema,
    schemaFields: {
      "operand.name": "name",
      "option.json": "json",
      "option.new-root": "newRoot",
      "option.scope": "scope",
      "option.verification-evidence-ref": "verificationEvidenceRef",
      "option.expected-candidate": "expectedCandidate",
      "option.expected-subject": "expectedSubject",
    },
  } as const satisfies CommandInputRegistration;

/** Interaction policy for Candidate attestation. */
export const attestCommandInputPolicyDeclarations = [{
    commandPath: "attest",
    aliases: [],
    sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    })],
  }] satisfies readonly CommandInputDeclaration[];
