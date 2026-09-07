/** Project timing composition for bounded hosted-review awaits. */

import type { ConfigSettings } from "../../../lib/config/schema.js";
import { getArcConfigField } from "../../../lib/config/schema.js";
import {
  HostedAwaitEnvelopeSchema,
  HostedAwaitExecutionEnvelopeSchema,
  type HostedAwaitEnvelope,
  type HostedAwaitExecutionEnvelope,
} from "./await.js";

type HostedAwaitConfigKey =
  | "review.hosted_await_timeout_seconds"
  | "review.hosted_await_initial_poll_interval_seconds"
  | "review.hosted_await_attention_after_minutes";
type HostedAwaitConfigSettings = Pick<ConfigSettings, HostedAwaitConfigKey>;

/** One effective bounded call plus its unattended-wait attention threshold. */
export interface HostedAwaitTiming {
  readonly request: HostedAwaitExecutionEnvelope;
  readonly attentionAfterMs: number;
}

/** Typed invalid-input failure for request/config timing composition. */
export class HostedAwaitTimingError extends Error {
  readonly code = "invalid-input";
}

function configuredNumber(settings: HostedAwaitConfigSettings, key: HostedAwaitConfigKey): number {
  const value = settings[key];
  const parsed = getArcConfigField(key).schema.safeParse(value);
  if (!parsed.success) throw new HostedAwaitTimingError(`Invalid hosted await timing setting: ${key}`);
  return Number(value);
}

/**
 * Compose optional per-call overrides with project-owned hosted-await timing.
 *
 * @param input - Public await request with optional timing overrides.
 * @param settings - Validated project timing settings.
 * @returns The effective bounded call and unattended-wait attention threshold.
 */
export function resolveHostedAwaitTiming(
  input: HostedAwaitEnvelope,
  settings: HostedAwaitConfigSettings,
): HostedAwaitTiming {
  const request = HostedAwaitEnvelopeSchema.parse(input);
  const configuredTimeoutSeconds = configuredNumber(settings, "review.hosted_await_timeout_seconds");
  const configuredPollIntervalSeconds = configuredNumber(
    settings,
    "review.hosted_await_initial_poll_interval_seconds",
  );
  if (configuredPollIntervalSeconds > configuredTimeoutSeconds) {
    throw new HostedAwaitTimingError(
      "Configured hosted await poll interval must not exceed its call timeout.",
    );
  }
  const timeoutSeconds = request.timeoutSeconds ?? configuredTimeoutSeconds;
  if (request.initialPollIntervalSeconds !== undefined
    && request.initialPollIntervalSeconds > timeoutSeconds) {
    throw new HostedAwaitTimingError(
      "initialPollIntervalSeconds must not exceed timeoutSeconds",
    );
  }
  const timeoutMs = timeoutSeconds * 1_000;
  const pollIntervalMs = request.initialPollIntervalSeconds === undefined
    ? Math.min(configuredPollIntervalSeconds * 1_000, timeoutMs)
    : request.initialPollIntervalSeconds * 1_000;
  const execution = HostedAwaitExecutionEnvelopeSchema.safeParse({
    schemaVersion: request.schemaVersion,
    handle: request.handle,
    timeoutMs,
    pollIntervalMs,
    ...(request.continueAfterAttention === true ? { continueAfterAttention: true as const } : {}),
  });
  if (!execution.success) {
    throw new HostedAwaitTimingError(execution.error.message);
  }
  return {
    request: execution.data,
    attentionAfterMs: Math.min(
      Number.MAX_SAFE_INTEGER,
      configuredNumber(settings, "review.hosted_await_attention_after_minutes") * 60 * 1_000,
    ),
  };
}
