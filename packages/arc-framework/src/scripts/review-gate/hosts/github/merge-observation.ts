/** GitHub adapter for provider-neutral exact-coordinate merge admission. */

import { setTimeout as delay } from "node:timers/promises";

import {
  ChangeRequestMergeObservationSchema,
  type ChangeRequestMergeCoordinates,
  type ChangeRequestMergeObservation,
  type ChangeRequestMergeObservationPort,
  type HostAdmissionRefusalCondition,
} from "../../change-request.js";
import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import { GitObjectIdSchema } from "../../core/gate-contract-v2-schema.js";
import { readGhRequiredStatusPolicy } from "./checks-await.js";

const MAX_PULL_READS = 3;
const RECOMPUTATION_PAUSE_MS = 2_000;

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

/** A stable condition: another read of the same coordinates reports it again, so it is refused, not pending. */
function refused(
  coordinates: ChangeRequestMergeCoordinates,
  condition: HostAdmissionRefusalCondition,
  detail: string,
): ChangeRequestMergeObservation {
  return ChangeRequestMergeObservationSchema.parse({ ...coordinates, state: "refused", condition, detail });
}

function failureDetail(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_024) || "Host evidence was unavailable.";
}

function testMergeObservation(
  coordinates: ChangeRequestMergeCoordinates,
  parents: readonly string[],
  mergeCommit: string,
  baseContained: boolean | undefined,
): ChangeRequestMergeObservation {
  const evidenceRef = `github:test-merge:${mergeCommit}`;
  if (parents.length === 2 && parents[0] === coordinates.base && parents[1] === coordinates.head) {
    return ChangeRequestMergeObservationSchema.parse({ ...coordinates, state: "mergeable", evidenceRef });
  }
  if (baseContained === false && parents.length === 2
    && parents[1] === coordinates.head && parents[0] !== coordinates.head) {
    return ChangeRequestMergeObservationSchema.parse({
      ...coordinates,
      state: "unresolved",
      condition: "stale-base-test-merge",
      detail: "GitHub's test merge covers the exact head but a different base; GitHub may still be recomputing "
        + "its test merge after base movement.",
      evidenceRef,
    });
  }
  return unresolved(
    coordinates,
    "GitHub test-merge parents did not match the requested coordinates; GitHub may still be recomputing "
      + "its test merge after a base or head movement.",
  );
}

function observationLimitResult(
  coordinates: ChangeRequestMergeCoordinates,
  lastObservation: ChangeRequestMergeObservation | null,
  lastDetail: string,
): ChangeRequestMergeObservation {
  if (lastObservation?.state === "unresolved") {
    return {
      ...lastObservation,
      detail: `${lastObservation.detail} The three-read observation limit was reached. `
        + "Retry exact merge admission after GitHub recomputes the test merge.",
    };
  }
  return unresolved(coordinates, `${lastDetail} The three-read observation limit was reached.`);
}

/**
 * Build the supported GitHub merge-observation adapter.
 *
 * @param runner - GitHub process boundary.
 * @param overrides - Optional abort-aware time boundary for recomputation waits.
 * @returns The exact-coordinate host admission port.
 */
export function createGhChangeRequestMergeObservationPort(
  runner: HostedProcessRunner,
  overrides: { wait?: (milliseconds: number, signal: AbortSignal) => Promise<void> } = {},
): ChangeRequestMergeObservationPort {
  const wait = overrides.wait ?? ((milliseconds, signal) => delay(milliseconds, undefined, { signal }));
  return {
    async observe(coordinates, options) {
      const signal = options?.signal ?? AbortSignal.timeout(60_000);
      let lastDetail = "GitHub did not finish computing exact merge admission.";
      let lastObservation: ChangeRequestMergeObservation | null = null;
      let recomputing = false;
      for (let attempt = 0; attempt < MAX_PULL_READS; attempt += 1) {
        signal.throwIfAborted();
        if (recomputing) await wait(RECOMPUTATION_PAUSE_MS, signal);
        signal.throwIfAborted();
        recomputing = false;
        lastObservation = null;
        let pull: PullObservation;
        try {
          pull = pullObservation(parse((await runner.run([
            "api", `repos/${coordinates.repository}/pulls/${coordinates.changeRequest}`,
          ], { signal })).stdout, "pull-request"));
        } catch (error) {
          if (signal.aborted) signal.throwIfAborted();
          return unresolved(coordinates, `GitHub pull-request evidence was unavailable: ${failureDetail(error)}`);
        }
        if (pull.number !== coordinates.changeRequest) {
          return unresolved(coordinates, "GitHub returned a different pull request than the one requested.");
        }
        if (pull.baseRef !== coordinates.baseRef) {
          return refused(
            coordinates,
            "base-ref-mismatch",
            `GitHub reports the pull request targets ${pull.baseRef}, not ${coordinates.baseRef}.`,
          );
        }
        if (pull.head !== coordinates.head) {
          return refused(
            coordinates,
            "head-moved",
            `GitHub reports the pull request head is ${pull.head}, not ${coordinates.head}.`,
          );
        }
        if (options?.baseContained !== true) {
          try {
            const policy = await readGhRequiredStatusPolicy(
              runner,
              coordinates.repository,
              pull.baseRef,
              signal,
            );
            if (policy.strictCurrentness) {
              return options?.baseContained === false
                ? ChangeRequestMergeObservationSchema.parse({
                    ...coordinates,
                    state: "base-currentness-required",
                    detail: "Applicable target policy requires the head to include the current base.",
                    evidenceRef: `github:target-policy:${pull.baseRef}`,
                  })
                : unresolved(coordinates, "Exact head containment is unavailable under strict target policy.");
            }
          } catch (error) {
            if (signal.aborted) signal.throwIfAborted();
            return unresolved(coordinates, `GitHub target policy was unavailable: ${failureDetail(error)}`);
          }
        }
        if (pull.mergeable === true && pull.mergeCommit !== null) {
          try {
            const parents = commitParents(parse((await runner.run([
              "api", `repos/${coordinates.repository}/commits/${pull.mergeCommit}`,
            ], { signal })).stdout, "test-merge-commit"));
            const observation = testMergeObservation(coordinates, parents, pull.mergeCommit, options?.baseContained);
            if (observation.state !== "unresolved" || observation.condition !== "stale-base-test-merge") {
              return observation;
            }
            lastObservation = observation;
            recomputing = true;
            continue;
          } catch (error) {
            if (signal.aborted) signal.throwIfAborted();
            lastDetail = `GitHub test-merge evidence was unavailable: ${failureDetail(error)}`;
            continue;
          }
        }
        if (pull.mergeable === false) {
          return refused(
            coordinates,
            "not-mergeable",
            "GitHub reports the pull request cannot merge cleanly into its base.",
          );
        }
        lastDetail = "GitHub is still computing exact merge admission.";
        recomputing = true;
      }
      return observationLimitResult(coordinates, lastObservation, lastDetail);
    },
  };
}
