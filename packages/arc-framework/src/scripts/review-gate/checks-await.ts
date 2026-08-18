/** Bounded required-check observation for one exact pull-request head. */

import { z } from "zod";
import { boundedWait, type BoundedWaitClock } from "./bounded-wait.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

export const ChecksAwaitInputSchema = z.object({
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
  timeoutMs: z.number().int().positive().max(30 * 60 * 1_000),
  pollIntervalMs: z.number().int().positive().max(60 * 1_000),
}).strict().refine((value) => value.pollIntervalMs <= value.timeoutMs, {
  message: "pollIntervalMs must not exceed timeoutMs",
});
export type ChecksAwaitInput = z.infer<typeof ChecksAwaitInputSchema>;

export interface RequiredCheck {
  name: string;
  state: "pending" | "green" | "failed";
}

export interface RequiredChecksPort {
  resolveRepository(): Promise<string>;
  readHead(repository: string, pullRequest: number, signal: AbortSignal): Promise<string>;
  readRequiredChecks(repository: string, pullRequest: number, signal: AbortSignal): Promise<RequiredCheck[]>;
}

/** The status a required-check set reduces to. */
export type AggregatedCheckStatus = "not-required" | "failed" | "green" | "pending";

/**
 * Reduce a required-check set to one status.
 *
 * @param checks - The observed required checks for one exact head.
 * @returns `not-required` for an empty set, `failed` on any failure, `green` when all pass, else `pending`.
 */
export function aggregateChecks(
  checks: readonly Pick<RequiredCheck, "state">[],
): AggregatedCheckStatus {
  if (checks.length === 0) return "not-required";
  if (checks.some(({ state }) => state === "failed")) return "failed";
  if (checks.every(({ state }) => state === "green")) return "green";
  return "pending";
}

interface ChecksResultBase {
  schemaVersion: 1;
  mode: "review-checks-await";
  repository: string;
  pullRequest: number;
  headSha: string;
}

export type ChecksAwaitResult = ChecksResultBase & (
  | { state: "not-required"; nextAction: "complete"; checks: [] }
  | { state: "green"; nextAction: "complete"; checks: RequiredCheck[] }
  | { state: "failed"; nextAction: "stop"; checks: RequiredCheck[] }
  | { state: "pending"; nextAction: "await"; checks: RequiredCheck[]; elapsedMs: number }
  | { state: "stale-target"; nextAction: "stop"; actualHeadSha: string }
);

/** Await required checks for one exact pull-request head. */
export async function awaitRequiredChecks(
  input: ChecksAwaitInput,
  dependencies: { port: RequiredChecksPort; clock: BoundedWaitClock },
): Promise<ChecksAwaitResult> {
  const repository = await dependencies.port.resolveRepository();
  const base = {
    schemaVersion: 1,
    mode: "review-checks-await",
    repository,
    pullRequest: input.pullRequest,
    headSha: input.headSha,
  } as const;
  let latestChecks: RequiredCheck[] = [];
  return boundedWait<ChecksAwaitResult>({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    clock: dependencies.clock,
    deadline: async (elapsedMs) => {
      const actualHeadSha = await dependencies.port.readHead(
        repository,
        input.pullRequest,
        AbortSignal.timeout(input.pollIntervalMs),
      );
      return actualHeadSha === input.headSha
        ? { ...base, state: "pending", nextAction: "await", checks: latestChecks, elapsedMs }
        : { ...base, state: "stale-target", nextAction: "stop", actualHeadSha };
    },
    attempt: async ({ signal }) => {
      const actualHeadSha = await dependencies.port.readHead(repository, input.pullRequest, signal);
      if (actualHeadSha !== input.headSha) {
        return { kind: "return", value: {
          ...base,
          state: "stale-target",
          nextAction: "stop",
          actualHeadSha,
        } };
      }
      latestChecks = await dependencies.port.readRequiredChecks(repository, input.pullRequest, signal);
      switch (aggregateChecks(latestChecks)) {
        case "not-required":
          return { kind: "return", value: { ...base, state: "not-required", nextAction: "complete", checks: [] } };
        case "failed":
          return { kind: "return", value: { ...base, state: "failed", nextAction: "stop", checks: latestChecks } };
        case "green":
          return { kind: "return", value: { ...base, state: "green", nextAction: "complete", checks: latestChecks } };
        default:
          return { kind: "continue" };
      }
    },
  });
}
