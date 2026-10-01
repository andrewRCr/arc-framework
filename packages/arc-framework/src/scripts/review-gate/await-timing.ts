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

/** One effective bounded call. */
export interface AwaitTiming {
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
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
 * An omitted interval is capped to the effective bound; an explicit one must fit inside it.
 *
 * @param input - The wait's name, its two settings keys, the project settings, and the call's overrides.
 * @returns The effective bound and initial polling interval, in milliseconds.
 */
export function resolveAwaitTiming<TimeoutKey extends AwaitTimingKey, IntervalKey extends AwaitTimingKey>(input: {
  wait: string;
  keys: { timeoutSeconds: TimeoutKey; initialPollIntervalSeconds: IntervalKey };
  settings: Pick<ConfigSettings, TimeoutKey | IntervalKey>;
  overrides: {
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    /** How the caller spells its overrides, for an incompatible-override refusal. */
    labels: { timeout: string; pollInterval: string };
  };
}): AwaitTiming {
  const { wait, keys, settings, overrides } = input;
  const configuredTimeoutMs = configuredTiming(settings, keys.timeoutSeconds, wait) * 1_000;
  const configuredPollIntervalMs = configuredTiming(settings, keys.initialPollIntervalSeconds, wait) * 1_000;
  if (configuredPollIntervalMs > configuredTimeoutMs) {
    throw new AwaitTimingError(`Configured ${wait} poll interval must not exceed its call timeout.`);
  }
  const timeoutMs = overrides.timeoutMs ?? configuredTimeoutMs;
  if (overrides.pollIntervalMs !== undefined && overrides.pollIntervalMs > timeoutMs) {
    throw new AwaitTimingError(`${overrides.labels.pollInterval} must not exceed ${overrides.labels.timeout}`);
  }
  return {
    timeoutMs,
    pollIntervalMs: overrides.pollIntervalMs ?? Math.min(configuredPollIntervalMs, timeoutMs),
  };
}
