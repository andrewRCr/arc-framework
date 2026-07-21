/** Provider-neutral frontline source registry and deterministic fallback resolution. */

import { z } from "zod";

const FrontlineSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const FrontlineAgentHandleSchema = z.strictObject({
  capabilityId: FrontlineSourceIdSchema,
}).readonly();
const FrontlineAgentDescriptorSchema = z.strictObject({
  kind: z.literal("agent"),
  handle: FrontlineAgentHandleSchema,
}).readonly();
const FrontlineExecutableSchema = z.string().regex(/^[A-Za-z0-9._/+:-]+$/u);
const FrontlineArgvSchema = z.array(z.string().refine((value) => !value.includes("\0"), {
  message: "argv entries cannot contain NUL",
})).readonly();
const FrontlineCommandDescriptorSchema = z.strictObject({
  kind: z.literal("command"),
  executable: FrontlineExecutableSchema,
  argv: FrontlineArgvSchema,
}).readonly();
const FrontlineSourceRegistrationSchema = z.strictObject({
  sourceId: FrontlineSourceIdSchema,
  descriptor: z.discriminatedUnion("kind", [
    FrontlineAgentDescriptorSchema,
    FrontlineCommandDescriptorSchema,
  ]),
}).readonly();

export const FrontlineSourceDescriptorSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    sourceId: FrontlineSourceIdSchema,
    kind: z.literal("agent"),
    handle: FrontlineAgentHandleSchema,
  }).readonly(),
  z.strictObject({
    sourceId: FrontlineSourceIdSchema,
    kind: z.literal("command"),
    executable: FrontlineExecutableSchema,
    argv: FrontlineArgvSchema,
  }).readonly(),
]);

export type FrontlineSourceRegistration = z.input<typeof FrontlineSourceRegistrationSchema>;
export type FrontlineSourceDescriptor = z.infer<typeof FrontlineSourceDescriptorSchema>;

/** Closed, injected mapping from safe source IDs to non-shell carrier descriptors. */
export class FrontlineSourceRegistry {
  readonly #sources = new Map<string, FrontlineSourceDescriptor>();

  constructor(registrations: readonly FrontlineSourceRegistration[]) {
    for (const input of registrations) {
      const registration = FrontlineSourceRegistrationSchema.parse(input);
      if (this.#sources.has(registration.sourceId)) {
        throw new Error(`duplicate frontline sourceId: ${registration.sourceId}`);
      }
      const descriptor: FrontlineSourceDescriptor = registration.descriptor.kind === "agent"
        ? {
          sourceId: registration.sourceId,
          kind: "agent",
          handle: registration.descriptor.handle,
        }
        : {
          sourceId: registration.sourceId,
          kind: "command",
          executable: registration.descriptor.executable,
          argv: registration.descriptor.argv,
        };
      this.#sources.set(registration.sourceId, Object.freeze(descriptor));
    }
  }

  resolve(sourceId: string): FrontlineSourceDescriptor | null {
    return this.#sources.get(sourceId) ?? null;
  }
}

/** Private developer preference plus tracked project-default reader. */
export interface FrontlineSourcePreferenceReader {
  readDeveloperSourceId(): Promise<string | null>;
  readProjectSourceId(): Promise<string | null>;
}

export type FrontlineSourceTier = "invocation" | "developer" | "project" | "unbound";
export type FrontlineSourceDiagnosticCode =
  | "malformed-source-id"
  | "unregistered-source-id"
  | "preference-read-failed";

export interface FrontlineSourceDiagnostic {
  code: FrontlineSourceDiagnosticCode;
  tier: Exclude<FrontlineSourceTier, "unbound">;
  sourceId?: string;
}

export interface FrontlineSourceResolution {
  source: FrontlineSourceDescriptor | null;
  sourceTier: FrontlineSourceTier;
  diagnostics: FrontlineSourceDiagnostic[];
}

function resolveCandidate(
  sourceId: unknown,
  tier: Exclude<FrontlineSourceTier, "unbound">,
  registry: FrontlineSourceRegistry,
): { source: FrontlineSourceDescriptor | null; diagnostic?: FrontlineSourceDiagnostic } {
  const parsed = FrontlineSourceIdSchema.safeParse(sourceId);
  if (!parsed.success) {
    return {
      source: null,
      diagnostic: { code: "malformed-source-id", tier, sourceId: String(sourceId) },
    };
  }
  const source = registry.resolve(parsed.data);
  return source === null
    ? {
      source: null,
      diagnostic: { code: "unregistered-source-id", tier, sourceId: parsed.data },
    }
    : { source };
}

/** Resolve invocation → developer → project → unbound without probing or executing a carrier. */
export async function resolveFrontlineSource(input: {
  invocationSourceId?: unknown;
  preferences: FrontlineSourcePreferenceReader;
  registry: FrontlineSourceRegistry;
}): Promise<FrontlineSourceResolution> {
  if (input.invocationSourceId !== undefined) {
    const selected = resolveCandidate(input.invocationSourceId, "invocation", input.registry);
    return selected.source === null
      ? { source: null, sourceTier: "unbound", diagnostics: [selected.diagnostic].filter(isDiagnostic) }
      : { source: selected.source, sourceTier: "invocation", diagnostics: [] };
  }

  const diagnostics: FrontlineSourceDiagnostic[] = [];
  const tiers = [
    ["developer", input.preferences.readDeveloperSourceId.bind(input.preferences)],
    ["project", input.preferences.readProjectSourceId.bind(input.preferences)],
  ] as const;
  for (const [tier, read] of tiers) {
    let sourceId: string | null;
    try {
      sourceId = await read();
    } catch {
      diagnostics.push({ code: "preference-read-failed", tier });
      continue;
    }
    if (sourceId === null) continue;
    const selected = resolveCandidate(sourceId, tier, input.registry);
    if (selected.source !== null) {
      return { source: selected.source, sourceTier: tier, diagnostics };
    }
    if (selected.diagnostic !== undefined) diagnostics.push(selected.diagnostic);
  }
  return { source: null, sourceTier: "unbound", diagnostics };
}

function isDiagnostic(
  diagnostic: FrontlineSourceDiagnostic | undefined,
): diagnostic is FrontlineSourceDiagnostic {
  return diagnostic !== undefined;
}
