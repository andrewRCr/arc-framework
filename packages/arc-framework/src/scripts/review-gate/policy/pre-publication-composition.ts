/** Production composition for the typed pre-publication review procedure. */

import { readFile } from "node:fs/promises";

import { parseMetaRecord, toMetaRecord } from "../../../lib/active/meta-reader.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { getCurrentBranch, type GitExec } from "../../../lib/git/index.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { materializeArcPath, resolveArcPath } from "../../../lib/layout/index.js";
import { projectCandidateCurrentness } from "../../../lib/work-unit/candidate-attestation.js";
import { readCandidateRecord } from "../../../lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../../lib/work-unit/git-candidate-subject.js";
import { resolveChangeRequest } from "../change-request.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { createLocalFrontlineSourcePreferenceReader } from "../hosts/local/frontline-source-preferences.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { deriveLocalReviewTarget } from "../hosts/local/repository-target.js";
import { readLaneProgressAcrossLineage } from "../lane-progress.js";
import { composeWorkUnitReviewAssurance } from "./assurance.js";
import { resolveConfiguredLanePolicy } from "./lane-policy-config.js";
import type {
  AssuranceRead,
  CandidateRead,
  ImmutableTargetRead,
  PrePublicationCompositionDependencies,
  TargetRead,
} from "./pre-publication-request.js";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bind the canonical Candidate, meta, host, identity, and durable-progress reads to the composition.
 *
 * @param input - The repository root and its Git boundary.
 * @returns The dependency bundle `composePrePublicationReviewRequest` consumes.
 */
export function createPrePublicationCompositionDependencies(input: {
  cwd: string;
  exec: GitExec;
}): PrePublicationCompositionDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = async () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return (await settingsPromise).settings;
  };
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };

  return {
    readCandidate: async (workUnit): Promise<CandidateRead> => {
      const name = SlugSchema.parse(workUnit);
      const record = await readCandidateRecord(input.cwd, name);
      if (record === null) return { status: "missing" };
      const current = await collectGitCandidateTarget({
        cwd: input.cwd,
        name,
        baseBranch: (await settings())["branch.base"],
        exec: input.exec,
      });
      const currentness = projectCandidateCurrentness({ record, current });
      if (currentness.status === "blocked") return { status: "blocked", reason: currentness.nextAction };
      return {
        status: "current",
        candidateId: currentness.candidateId,
        headSha: currentness.recognizedRevision,
        subjectDigest: current.subject.subjectDigest,
        implementationChanged: currentness.implementationChanged,
        convergenceVerification: currentness.convergenceVerification,
        lineageHeadShas: [...new Set([
          record.attestation.baseRevision,
          ...record.responses.flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
          ...record.lineageAttestations.map((attestation) => attestation.target.revision),
          currentness.recognizedRevision,
        ])],
      };
    },

    readAssurance: async (workUnit): Promise<AssuranceRead> => {
      const metaPath = materializeArcPath(input.cwd, resolveArcPath({
        kind: "work-unit-artifact",
        placement: { kind: "active", scope: { kind: "project" } },
        slug: SlugSchema.parse(workUnit),
        artifact: "meta",
      }));
      let content: string;
      try {
        content = await readFile(metaPath, "utf8");
      } catch {
        return { status: "refused", reason: `No active meta record exists for \`${workUnit}\`.` };
      }
      const meta = toMetaRecord(parseMetaRecord(content));
      if (meta === null) {
        return { status: "refused", reason: `The active meta record for \`${workUnit}\` is incomplete.` };
      }
      const composed = composeWorkUnitReviewAssurance(
        meta,
        createLocalReviewMethodFilePort({ cwd: input.cwd }),
        createLocalReviewRubricBindingPort({ cwd: input.cwd }),
      );
      if (composed.status === "refused") {
        return {
          status: "refused",
          reason: `The work unit's review rubric could not be bound: ${composed.diagnostics.join("; ")}`,
        };
      }
      return {
        status: "resolved",
        assurance: composed.assurance.assurance,
        activity: composed.assurance.activity,
      };
    },

    resolveTarget: async (headSha): Promise<TargetRead> => {
      const port = createGhChangeRequestResolutionPort(input.exec, input.cwd);
      let repository: string;
      try {
        repository = await port.resolveRepository();
      } catch (error) {
        return {
          status: "refused",
          reason: `The origin repository coordinates could not be resolved: ${describe(error)}`,
        };
      }
      const headRef = await getCurrentBranch(input.exec);
      if (headRef === null) {
        return { status: "refused", reason: "Pre-publication review requires an attached branch." };
      }
      // Only an open change request at this exact head binds a pull request. Every other
      // disposition — including a host the resolver could not reach — leaves the target unbound,
      // which reserves the hosted source rather than letting a lower-ranked local carrier take its
      // place.
      const changeRequest = await resolveChangeRequest({ headRef, headSha }, port);
      return {
        status: "resolved",
        target: {
          repository,
          pullRequest: changeRequest.state === "open" ? changeRequest.candidate.number : null,
          headSha,
        },
      };
    },

    deriveImmutableTarget: async (): Promise<ImmutableTargetRead> => {
      try {
        return {
          status: "resolved",
          target: await deriveLocalReviewTarget({
            exec: input.exec,
            cwd: input.cwd,
            baseRef: (await settings())["branch.base"],
            repositoryId: await repositoryId(),
          }),
        };
      } catch (error) {
        return { status: "unavailable", reason: describe(error) };
      }
    },

    readLaneProgress: async (lane, headSha, lineageHeadShas) => readLaneProgressAcrossLineage(store, {
      lane,
      repositoryId: await repositoryId(),
      headSha,
      lineageHeadShas,
    }),

    readLanePolicy: async (lane) => resolveConfiguredLanePolicy({
      lane,
      settings: await settings(),
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: input.cwd,
        exec: input.exec,
        readFile: (path) => readFile(path, "utf8"),
      }),
    }),
  };
}
