/** Project timing composition for bounded hosted-review awaits. */

import type { ConfigSettings } from "../../../lib/config/schema.js";
import { AwaitTimingError, configuredTiming, resolveAwaitTiming } from "../await-timing.js";
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

const toMs = (seconds: number | undefined): number | undefined => seconds === undefined ? undefined : seconds * 1_000;

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
  const { timeoutMs, pollIntervalMs } = resolveAwaitTiming({
    wait: "hosted await",
    keys: {
      timeoutSeconds: "review.hosted_await_timeout_seconds",
      initialPollIntervalSeconds: "review.hosted_await_initial_poll_interval_seconds",
    },
    settings,
    overrides: {
      timeoutMs: toMs(request.timeoutSeconds),
      pollIntervalMs: toMs(request.initialPollIntervalSeconds),
      labels: { timeout: "timeoutSeconds", pollInterval: "initialPollIntervalSeconds" },
    },
  });
  const execution = HostedAwaitExecutionEnvelopeSchema.safeParse({
    schemaVersion: request.schemaVersion,
    handle: request.handle,
    timeoutMs,
    pollIntervalMs,
    ...(request.continueAfterAttention === true ? { continueAfterAttention: true as const } : {}),
  });
  if (!execution.success) {
    throw new AwaitTimingError(execution.error.message);
  }
  return {
    request: execution.data,
    attentionAfterMs: Math.min(
      Number.MAX_SAFE_INTEGER,
      configuredTiming(settings, "review.hosted_await_attention_after_minutes", "hosted await") * 60 * 1_000,
    ),
  };
}
