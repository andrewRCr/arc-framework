/** GitHub adapter for provider-neutral exact-coordinate merge admission. */

import {
  ChangeRequestMergeObservationSchema,
  type ChangeRequestMergeCoordinates,
  type ChangeRequestMergeObservation,
  type ChangeRequestMergeObservationPort,
} from "../../change-request.js";
import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import { GitObjectIdSchema } from "../../core/gate-contract-v2-schema.js";
import { readGhRequiredStatusPolicy } from "./checks-await.js";

const MAX_PULL_READS = 3;

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function objectId(value: unknown, path: string): string {
  if (!GitObjectIdSchema.safeParse(value).success) throw new Error(`${path}: expected a Git object ID`);
  return value as string;
}

interface PullObservation {
  number: number;
  baseRef: string;
  base: string;
  head: string;
  mergeable: boolean | null;
  mergeCommit: string | null;
}

function pullObservation(value: unknown): PullObservation {
  const pull = record(value, "pull-request");
  const base = record(pull.base, "pull-request.base");
  const head = record(pull.head, "pull-request.head");
  if (!Number.isInteger(pull.number) || Number(pull.number) <= 0) {
    throw new Error("pull-request.number: expected a positive integer");
  }
  if (typeof base.ref !== "string" || base.ref === "") {
    throw new Error("pull-request.base.ref: expected a non-empty string");
  }
  if (pull.mergeable !== null && typeof pull.mergeable !== "boolean") {
    throw new Error("pull-request.mergeable: expected boolean or null");
  }
  const mergeCommit = pull.merge_commit_sha === null
    ? null
    : objectId(pull.merge_commit_sha, "pull-request.merge_commit_sha");
  return {
    number: Number(pull.number),
    baseRef: base.ref,
    base: objectId(base.sha, "pull-request.base.sha"),
    head: objectId(head.sha, "pull-request.head.sha"),
    mergeable: pull.mergeable,
    mergeCommit,
  };
}

function commitParents(value: unknown): string[] {
  const commit = record(value, "test-merge-commit");
  if (!Array.isArray(commit.parents)) throw new Error("test-merge-commit.parents: expected an array");
  return commit.parents.map((parent, index) => objectId(
    record(parent, `test-merge-commit.parents[${index}]`).sha,
    `test-merge-commit.parents[${index}].sha`,
  ));
}

function unresolved(
  coordinates: ChangeRequestMergeCoordinates,
  detail: string,
): ChangeRequestMergeObservation {
  return ChangeRequestMergeObservationSchema.parse({ ...coordinates, state: "unresolved", detail });
}

function failureDetail(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_024) || "Host evidence was unavailable.";
}

/** Build the supported GitHub merge-observation adapter. */
export function createGhChangeRequestMergeObservationPort(
  runner: HostedProcessRunner,
): ChangeRequestMergeObservationPort {
  return {
    async observe(coordinates, options) {
      const signal = options?.signal ?? AbortSignal.timeout(60_000);
      let lastDetail = "GitHub did not finish computing exact merge admission.";
      for (let attempt = 0; attempt < MAX_PULL_READS; attempt += 1) {
        signal.throwIfAborted();
        let pull: PullObservation;
        try {
          pull = pullObservation(parse((await runner.run([
            "api", `repos/${coordinates.repository}/pulls/${coordinates.changeRequest}`,
          ], { signal })).stdout, "pull-request"));
        } catch (error) {
          if (signal.aborted) signal.throwIfAborted();
          return unresolved(coordinates, `GitHub pull-request evidence was unavailable: ${failureDetail(error)}`);
        }
        if (
          pull.number !== coordinates.changeRequest
          || pull.base !== coordinates.base
          || pull.head !== coordinates.head
        ) {
          return unresolved(coordinates, "GitHub pull-request coordinates moved during merge observation.");
        }
        if (pull.mergeable === true && pull.mergeCommit !== null) {
          try {
            const parents = commitParents(parse((await runner.run([
              "api", `repos/${coordinates.repository}/commits/${pull.mergeCommit}`,
            ], { signal })).stdout, "test-merge-commit"));
            if (parents.length === 2 && parents[0] === coordinates.base && parents[1] === coordinates.head) {
              return ChangeRequestMergeObservationSchema.parse({
                ...coordinates,
                state: "mergeable",
                evidenceRef: `github:test-merge:${pull.mergeCommit}`,
              });
            }
            return unresolved(coordinates, "GitHub test-merge parents did not match the requested coordinates.");
          } catch (error) {
            if (signal.aborted) signal.throwIfAborted();
            lastDetail = `GitHub test-merge evidence was unavailable: ${failureDetail(error)}`;
            continue;
          }
        }
        try {
          const policy = await readGhRequiredStatusPolicy(
            runner,
            coordinates.repository,
            pull.baseRef,
            signal,
          );
          if (policy.strictCurrentness) {
            return ChangeRequestMergeObservationSchema.parse({
              ...coordinates,
              state: "base-currentness-required",
              detail: "Applicable target policy requires the head to include the current base.",
              evidenceRef: `github:target-policy:${pull.baseRef}`,
            });
          }
        } catch (error) {
          if (signal.aborted) signal.throwIfAborted();
          return unresolved(coordinates, `GitHub target policy was unavailable: ${failureDetail(error)}`);
        }
        if (pull.mergeable === false) {
          return unresolved(
            coordinates,
            "GitHub did not establish mergeability and no applicable strict-currentness policy was proved.",
          );
        }
        lastDetail = "GitHub is still computing exact merge admission.";
      }
      return unresolved(coordinates, `${lastDetail} The three-read observation limit was reached.`);
    },
  };
}
