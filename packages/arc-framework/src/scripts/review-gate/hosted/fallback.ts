/** Narrow ordered fallback rule for hosted review sources. */

import { z } from "zod";

import {
  HostedProviderIdSchema,
  type HostedProviderId,
} from "./request.js";

const HostedFallbackEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  providers: z.array(z.string().min(1)).min(1),
});

export type HostedFallbackOutcome =
  | { kind: "completed" }
  | { kind: "rate-limited" | "transient-unavailable" }
  | { kind: "pending" }
  | { kind: "ambiguous-delivery" }
  | { kind: "terminal-failure"; reason?: string };

interface HostedAttempt {
  provider: HostedProviderId;
  outcome: HostedFallbackOutcome["kind"];
}

export type HostedFallbackResult =
  | {
    schemaVersion: 1;
    state: "selected";
    provider: HostedProviderId;
    consumedPass: true;
    attemptedProviders: HostedAttempt[];
  }
  | {
    schemaVersion: 1;
    state: "pending" | "ambiguous-delivery" | "terminal-failure";
    provider: HostedProviderId;
    consumedPass: false;
    attemptedProviders: HostedAttempt[];
    reason?: string;
  }
  | {
    schemaVersion: 1;
    state: "exhausted";
    consumedPass: false;
    attemptedProviders: HostedAttempt[];
  }
  | {
    schemaVersion: 1;
    state: "invalid-source-list";
    consumedPass: false;
    attemptedProviders: [];
    unknownProviders: string[];
  };

/** Select one ordered hosted source, falling through only on proven safe unavailability. */
export async function resolveHostedFallback(
  input: unknown,
  dependencies: {
    attempt(provider: HostedProviderId): Promise<HostedFallbackOutcome>;
  },
): Promise<HostedFallbackResult> {
  const request = HostedFallbackEnvelopeSchema.parse(input);
  const parsedProviders = request.providers.map((provider) => HostedProviderIdSchema.safeParse(provider));
  const unknownProviders = parsedProviders.flatMap((parsed, index) =>
    parsed.success ? [] : [request.providers[index] ?? ""]);
  const knownProviders = parsedProviders.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  if (unknownProviders.length > 0 || new Set(knownProviders).size !== knownProviders.length) {
    return {
      schemaVersion: 1,
      state: "invalid-source-list",
      consumedPass: false,
      attemptedProviders: [],
      unknownProviders,
    };
  }

  const attemptedProviders: HostedAttempt[] = [];
  for (const provider of knownProviders) {
    const outcome = await dependencies.attempt(provider);
    attemptedProviders.push({ provider, outcome: outcome.kind });
    if (outcome.kind === "rate-limited" || outcome.kind === "transient-unavailable") continue;
    if (outcome.kind === "completed") {
      return {
        schemaVersion: 1,
        state: "selected",
        provider,
        consumedPass: true,
        attemptedProviders,
      };
    }
    return {
      schemaVersion: 1,
      state: outcome.kind,
      provider,
      consumedPass: false,
      attemptedProviders,
      ...(outcome.kind === "terminal-failure" && outcome.reason !== undefined
        ? { reason: outcome.reason }
        : {}),
    };
  }
  return {
    schemaVersion: 1,
    state: "exhausted",
    consumedPass: false,
    attemptedProviders,
  };
}
