/** Project-configured timing for bounded review-gate waits, with optional per-call overrides. */

import { getArcConfigField, type ConfigSettings } from "../../lib/config/schema.js";

type AwaitTimingKey =
  | "review.hosted_await_timeout_seconds"
  | "review.hosted_await_initial_poll_interval_seconds"
  | "review.hosted_await_attention_after_minutes"
  | "review.checks_await_timeout_seconds"
  | "review.checks_await_initial_poll_interval_seconds";

/** Typed invalid-input failure for override and configuration timing composition. */
export class AwaitTimingError extends Error {
  readonly code = "invalid-input";
}

/** The longest call window a bounded review-gate wait takes, in milliseconds. */
export const AWAIT_TIMEOUT_LIMIT_MS = 30 * 60 * 1_000;

/** The longest initial polling interval a bounded review-gate wait takes, in milliseconds. */
export const AWAIT_POLL_INTERVAL_LIMIT_MS = 60 * 1_000;

/** One effective bounded call. */
export interface AwaitTiming {
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

/** A notice that the call applied a per-call override at its wait's limit. */
export interface AwaitTimingDiagnostic {
  readonly code: "await-timing-limited";
  readonly message: string;
}

/** One effective bounded call, with a notice for each override it applied at its limit. */
export interface ResolvedAwaitTiming extends AwaitTiming {
  readonly diagnostics: readonly AwaitTimingDiagnostic[];
}

/**
 * Read one whole-number timing setting, refusing a value its field schema rejects.
 *
 * @param settings - Project settings carrying the key.
 * @param key - The timing setting to read.
 * @param wait - Names the wait in the refusal, such as "hosted await".
 * @returns The configured number, in the unit the key names.
 */
export function configuredTiming<Key extends AwaitTimingKey>(
  settings: Pick<ConfigSettings, Key>,
  key: Key,
  wait: string,
): number {
  const value = settings[key];
  if (!getArcConfigField<AwaitTimingKey>(key).schema.safeParse(value).success) {
    throw new AwaitTimingError(`Invalid ${wait} timing setting: ${key}`);
  }
  return Number(value);
}

/**
 * Compose optional per-call overrides with a wait's configured bound and initial polling interval.
 *
 * An omitted interval is capped to the effective bound; an explicit one must fit inside the bound it asks for. An
 * override above its wait's limit is applied at the limit, with a notice naming what the call used.
 *
 * @param input - The wait's name, its two settings keys, the project settings, and the call's overrides.
 * @returns The effective bound and initial polling interval, in milliseconds, and any limit notices.
 */
export function resolveAwaitTiming<TimeoutKey extends AwaitTimingKey, IntervalKey extends AwaitTimingKey>(input: {
  wait: string;
  keys: { timeoutSeconds: TimeoutKey; initialPollIntervalSeconds: IntervalKey };
  settings: Pick<ConfigSettings, TimeoutKey | IntervalKey>;
  overrides: {
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    /** How the caller spells its overrides, for an incompatible-override refusal or a limit notice. */
    labels: { timeout: string; pollInterval: string };
  };
}): ResolvedAwaitTiming {
  const { wait, keys, settings, overrides } = input;
  const configuredTimeoutMs = configuredTiming(settings, keys.timeoutSeconds, wait) * 1_000;
  const configuredPollIntervalMs = configuredTiming(settings, keys.initialPollIntervalSeconds, wait) * 1_000;
  if (configuredPollIntervalMs > configuredTimeoutMs) {
    throw new AwaitTimingError(`Configured ${wait} poll interval must not exceed its call timeout.`);
  }
  const requestedTimeoutMs = overrides.timeoutMs ?? configuredTimeoutMs;
  if (overrides.pollIntervalMs !== undefined && overrides.pollIntervalMs > requestedTimeoutMs) {
    throw new AwaitTimingError(`${overrides.labels.pollInterval} must not exceed ${overrides.labels.timeout}`);
  }
  const timeoutMs = Math.min(requestedTimeoutMs, AWAIT_TIMEOUT_LIMIT_MS);
  return {
    timeoutMs,
    pollIntervalMs: Math.min(overrides.pollIntervalMs ?? Math.min(configuredPollIntervalMs, timeoutMs),
      AWAIT_POLL_INTERVAL_LIMIT_MS),
    diagnostics: limitNotices(requestedTimeoutMs, overrides),
  };
}

function limitNotices(requestedTimeoutMs: number,
  overrides: { pollIntervalMs?: number | undefined; labels: { timeout: string; pollInterval: string } }): AwaitTimingDiagnostic[] {
  const minutes = AWAIT_TIMEOUT_LIMIT_MS / 60_000, seconds = AWAIT_POLL_INTERVAL_LIMIT_MS / 1_000;
  return [
    ...requestedTimeoutMs > AWAIT_TIMEOUT_LIMIT_MS ? [{ code: "await-timing-limited" as const, message:
      `${overrides.labels.timeout} is above the ${minutes}-minute limit, so this call waits up to ${minutes} minutes.` }] : [],
    ...(overrides.pollIntervalMs ?? 0) > AWAIT_POLL_INTERVAL_LIMIT_MS ? [{ code: "await-timing-limited" as const, message:
      `${overrides.labels.pollInterval} is above the ${seconds}-second limit, so this call starts polling every ${seconds} seconds.` }]
      : [],
  ];
}
