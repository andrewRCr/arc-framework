/** Production assembly for approved review dispositions. */

import { readFile, readdir } from "node:fs/promises";

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { resolveActiveWu } from "../../../lib/release/wu-resolution.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../../../lib/work-unit/lifecycle-index.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../../../lib/work-unit/candidate-record-store.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
} from "../../../lib/work-unit/git-candidate-subject.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import {
  bindHostedAttemptDisposition,
  settleLaneAttempt,
} from "../lane-progress.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import {
  LocalFrontlineOutcomeStore,
} from "../hosts/local/frontline-outcome-store.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { LocalReviewAuthorityError } from "../hosts/local/review-authority.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import type { RespondCommandDependencies } from "./respond-command.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";

/** Bind respond to repository-common records and trusted local/runtime identities. */
export function createRespondDependencies(input: {
  exec: GitExec;
  cwd: string;
}): RespondCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const prepare = createLocalPrepareDependencies(input);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  const lifecycleFs: LifecycleIndexFs = {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    readFile: (path) => readFile(path, "utf8"),
  };
  const recordCarriesRevision = (
    record: Awaited<ReturnType<typeof readCandidateRecordVersioned>>["record"],
    revision: string,
  ) => record !== null && [
    record.attestation.baseRevision,
    ...record.responses.flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
    ...record.lineageAttestations.map((attestation) => attestation.target.revision),
  ].includes(revision);
  const recordCarriesSubject = (
    record: NonNullable<Awaited<ReturnType<typeof readCandidateRecordVersioned>>["record"]>,
    subjectDigest: string,
  ) => [
    record.subject.subjectDigest,
    ...record.responses.flatMap((response) => [
      response.oldTarget.subject.subjectDigest,
      response.newTarget.subject.subjectDigest,
    ]),
    ...record.lineageAttestations.map((attestation) => attestation.target.subject.subjectDigest),
  ].includes(subjectDigest);
  return {
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    readReceipt: async (reference) => (await receipts()).readReceiptReference(reference),
    confirmTarget: (target) => prepare.confirmTarget(target),
    resolveLocalActors: async (evaluatorIdentity, admittedAuthorIdentity) => {
      try {
        const { authority } = await prepare.resolveAuthority(evaluatorIdentity);
        return {
          approverIdentity: authority.authorIdentity,
          proposerIdentity: authority.runtimeIdentity,
        };
      } catch (error) {
        if (!(error instanceof LocalReviewAuthorityError)
          || error.reason !== "vehicle-unresolved"
          || admittedAuthorIdentity === undefined) throw error;
        const live = await readLocalReviewLiveContext(input);
        if (live.context.activeIdentity !== admittedAuthorIdentity) {
          throw new LocalReviewAuthorityError("active-identity-owner-mismatch");
        }
        return {
          approverIdentity: admittedAuthorIdentity,
          proposerIdentity: `arc-cli/${getFrameworkVersion()}`,
        };
      }
    },
    resolveFrontlineActors: async () => {
      const live = await readLocalReviewLiveContext(input);
      if (live.context.activeIdentity === null) throw new Error("active-identity-missing");
      return {
        approverIdentity: live.context.activeIdentity,
        proposerIdentity: `arc-cli/${getFrameworkVersion()}`,
      };
    },
    readCandidateLineage: async (target) => {
      const active = await resolveActiveWu({ cwd: input.cwd });
      const completed = [...(await buildLifecycleIndex({ cwd: input.cwd, fs: lifecycleFs })).values()]
        .filter(({ location }) => location === "completed")
        .map(({ slug }) => slug);
      const candidates = [...new Set([
        ...(active.status === "resolved" && active.name !== "" ? [active.name] : []),
        ...completed,
      ])];
      const matching = [] as Array<{
        workUnit: string;
        record: NonNullable<Awaited<ReturnType<typeof readCandidateRecordVersioned>>["record"]>;
        version: string;
      }>;
      for (const workUnit of candidates) {
        const { record, version } = await readCandidateRecordVersioned(input.cwd, workUnit);
        if (record === null || version === null) continue;
        const carriesTarget = recordCarriesRevision(record, target.headSha)
          || recordCarriesSubject(record, (await collectGitCandidateTarget({
            cwd: input.cwd,
            name: workUnit,
            baseBranch: (await readConfigSettings(input.cwd)).settings["branch.base"],
            revision: target.headSha,
            exec: input.exec,
          })).subject.subjectDigest);
        if (carriesTarget) {
          matching.push({ workUnit, record, version });
        }
      }
      if (matching.length !== 1) return null;
      const selected = matching[0];
      if (selected === undefined) return null;
      const { settings } = await readConfigSettings(input.cwd);
      return {
        workUnit: selected.workUnit,
        record: selected.record,
        recordVersion: selected.version,
        current: await collectGitCandidateTarget({
          cwd: input.cwd,
          name: selected.workUnit,
          baseBranch: settings["branch.base"],
          exec: input.exec,
        }),
        unstagedReviewablePaths: await collectUnstagedReviewablePaths({
          cwd: input.cwd,
          name: selected.workUnit,
          exec: input.exec,
        }),
      };
    },
    // Staged like the record `attest` publishes: the Candidate's own projection never enters the
    // reviewable subject, so staging it advances the lineage without disturbing what review sees.
    appendCandidateResponse: async ({ workUnit, record, expectedRecordVersion }) => {
      const recordPath = await writeCandidateRecord(input.cwd, workUnit, record, expectedRecordVersion);
      await input.exec("git", ["add", "--", recordPath], { cwd: input.cwd });
      return { recordPath };
    },
    stageCandidateResponse: async (workUnit) => {
      const recordPath = resolveCandidateRecordRelativePath(workUnit);
      await input.exec("git", ["add", "--", recordPath], { cwd: input.cwd });
      return { recordPath };
    },
    settleLaneFindings: async (settlement) => {
      await settleLaneAttempt(prepare.operationStore, {
        ...settlement,
        now: new Date().toISOString(),
      });
    },
    bindHostedDisposition: async (binding) => {
      await bindHostedAttemptDisposition(prepare.operationStore, {
        ...binding,
        now: new Date().toISOString(),
      });
    },
  };
}
