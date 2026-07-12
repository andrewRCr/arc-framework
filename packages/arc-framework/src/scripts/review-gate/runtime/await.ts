/** Provider-neutral passive waiting over injected canonical host reads. */

export type AwaitKind = "ci" | "review";
export type AwaitConclusion = "pending" | "failure" | "success";

export type WaitRead<T> =
  | { kind: "ok"; value: T }
  | { kind: "authentication-failure" }
  | { kind: "malformed-projection" };

export interface ReviewAwaitState {
  conclusion: AwaitConclusion;
  blockerCodes: string[];
  ledgerVersion: number | null;
  receiptRefs: string[];
}

export interface AwaitHostPort {
  readPullRequestHead(repositoryRef: string, pullRequestNumber: number): Promise<WaitRead<string>>;
  readCiState(repositoryRef: string, headSha: string): Promise<WaitRead<AwaitConclusion>>;
  readReviewState(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    headSha: string;
  }): Promise<WaitRead<ReviewAwaitState>>;
}

export interface AwaitClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export type AwaitState = { conclusion: AwaitConclusion } | ReviewAwaitState;

export interface AwaitTransition {
  schemaVersion: 1;
  sequence: number;
  waitKind: AwaitKind;
  expectedHeadSha: string;
  observedAtMs: number;
  state: AwaitState;
}

export interface AwaitOutputPort {
  emit(transition: AwaitTransition): Promise<void>;
}

export type AwaitTerminal =
  | { kind: "success" | "failure"; waitKind: AwaitKind; expectedHeadSha: string; state: AwaitState }
  | { kind: "stale-head"; waitKind: AwaitKind; expectedHeadSha: string; actualHeadSha: string }
  | { kind: "timeout"; waitKind: AwaitKind; expectedHeadSha: string; elapsedMs: number }
  | { kind: "authentication-failure" | "malformed-projection"; waitKind: AwaitKind; expectedHeadSha: string };

export interface RunAwaitInput {
  repositoryRef: string;
  pullRequestNumber: number;
  expectedHeadSha: string;
  kind: AwaitKind;
  intervalMs: number;
  timeoutMs: number;
  host: AwaitHostPort;
  clock: AwaitClock;
  backoff(attempt: number, intervalMs: number): number;
  output: AwaitOutputPort;
}

function attention(
  read: Exclude<WaitRead<unknown>, { kind: "ok" }>,
  input: RunAwaitInput,
): AwaitTerminal {
  return { kind: read.kind, waitKind: input.kind, expectedHeadSha: input.expectedHeadSha };
}

function validate(input: RunAwaitInput): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(input.repositoryRef)) throw new Error("invalid-repository-ref");
  if (!Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) throw new Error("invalid-pull-request");
  if (!/^[a-f0-9]{40}$/u.test(input.expectedHeadSha)) throw new Error("invalid-expected-head");
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs <= 0) throw new Error("invalid-polling-interval");
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) throw new Error("invalid-timeout");
}

/** Wait until canonical state reaches a terminal or attention result. */
export async function runAwait(input: RunAwaitInput): Promise<AwaitTerminal> {
  validate(input);
  const startedAt = input.clock.now();
  let priorState = "";
  let sequence = 0;
  let attempt = 0;

  for (;;) {
    const elapsed = input.clock.now() - startedAt;
    if (elapsed >= input.timeoutMs) {
      return { kind: "timeout", waitKind: input.kind, expectedHeadSha: input.expectedHeadSha, elapsedMs: elapsed };
    }

    const head = await input.host.readPullRequestHead(input.repositoryRef, input.pullRequestNumber);
    if (head.kind !== "ok") return attention(head, input);
    if (head.value !== input.expectedHeadSha) {
      return {
        kind: "stale-head",
        waitKind: input.kind,
        expectedHeadSha: input.expectedHeadSha,
        actualHeadSha: head.value,
      };
    }

    const observation = input.kind === "ci"
      ? await input.host.readCiState(input.repositoryRef, input.expectedHeadSha)
      : await input.host.readReviewState({
        repositoryRef: input.repositoryRef,
        pullRequestNumber: input.pullRequestNumber,
        headSha: input.expectedHeadSha,
      });
    if (observation.kind !== "ok") return attention(observation, input);
    const state: AwaitState = input.kind === "ci" ? { conclusion: observation.value as AwaitConclusion }
      : observation.value as ReviewAwaitState;
    const normalized = JSON.stringify(state);
    if (normalized !== priorState) {
      sequence += 1;
      await input.output.emit({
        schemaVersion: 1,
        sequence,
        waitKind: input.kind,
        expectedHeadSha: input.expectedHeadSha,
        observedAtMs: input.clock.now(),
        state,
      });
      priorState = normalized;
    }
    if (state.conclusion !== "pending") {
      return { kind: state.conclusion, waitKind: input.kind, expectedHeadSha: input.expectedHeadSha, state };
    }

    const remaining = input.timeoutMs - (input.clock.now() - startedAt);
    const proposed = input.backoff(attempt, input.intervalMs);
    if (!Number.isFinite(proposed) || proposed <= 0) throw new Error("invalid-backoff");
    await input.clock.sleep(Math.min(Math.floor(proposed), remaining));
    attempt += 1;
  }
}
