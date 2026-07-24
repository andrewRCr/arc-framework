import { describe, expect, it, vi } from "vitest";

import {
  FrontlineSourceRegistry,
  resolveFrontlineSource,
  type FrontlineSourcePreferenceReader,
} from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

const registry = new FrontlineSourceRegistry([
  {
    sourceId: "fresh-agent",
    descriptor: { kind: "agent", handle: { capabilityId: "fresh-review-context" } },
  },
  {
    sourceId: "review-cli",
    descriptor: { kind: "command", executable: "reviewer", argv: ["--plain", "--scope=all"] },
  },
]);

function preferences(input: {
  developer?: readonly string[];
  project?: readonly string[];
}): FrontlineSourcePreferenceReader & {
  readDeveloperSourceIds: ReturnType<typeof vi.fn>;
  readProjectSourceIds: ReturnType<typeof vi.fn>;
} {
  return {
    readDeveloperSourceIds: vi.fn().mockResolvedValue(input.developer ?? []),
    readProjectSourceIds: vi.fn().mockResolvedValue(input.project ?? []),
  };
}

describe("FrontlineSourceRegistry", () => {
  it("stores typed agent handles and executable-plus-argv command descriptors", () => {
    expect(registry.resolve("fresh-agent")).toEqual({
      sourceId: "fresh-agent",
      kind: "agent",
      handle: { capabilityId: "fresh-review-context" },
    });
    expect(registry.resolve("review-cli")).toEqual({
      sourceId: "review-cli",
      kind: "command",
      executable: "reviewer",
      argv: ["--plain", "--scope=all"],
    });
  });

  it("rejects unsafe IDs, duplicate IDs, shell text, and malformed descriptors", () => {
    expect(() => new FrontlineSourceRegistry([{
      sourceId: "bad source",
      descriptor: { kind: "agent", handle: { capabilityId: "fresh-review-context" } },
    }])).toThrow(/sourceId/iu);
    expect(() => new FrontlineSourceRegistry([
      { sourceId: "same", descriptor: { kind: "agent", handle: { capabilityId: "first" } } },
      { sourceId: "same", descriptor: { kind: "agent", handle: { capabilityId: "second" } } },
    ])).toThrow(/duplicate/iu);
    expect(() => new FrontlineSourceRegistry([{
      sourceId: "shell",
      descriptor: { kind: "command", executable: "sh -c", argv: ["review everything"] },
    }])).toThrow(/executable/iu);
  });
});

describe("resolveFrontlineSource", () => {
  it("uses invocation, then developer, then project preference precedence", async () => {
    const invocationPreferences = preferences({ developer: ["fresh-agent"], project: ["fresh-agent"] });
    await expect(resolveFrontlineSource({
      invocationSourceId: "review-cli",
      preferences: invocationPreferences,
      registry,
    })).resolves.toMatchObject({ sourceTier: "invocation", source: { sourceId: "review-cli" } });
    expect(invocationPreferences.readDeveloperSourceIds).not.toHaveBeenCalled();
    expect(invocationPreferences.readProjectSourceIds).not.toHaveBeenCalled();

    await expect(resolveFrontlineSource({
      preferences: preferences({ developer: ["fresh-agent"], project: ["review-cli"] }),
      registry,
    })).resolves.toMatchObject({ sourceTier: "developer", source: { sourceId: "fresh-agent" } });

    await expect(resolveFrontlineSource({
      preferences: preferences({ project: ["review-cli"] }),
      registry,
    })).resolves.toMatchObject({ sourceTier: "project", source: { sourceId: "review-cli" } });
  });

  it("returns an explicit unbound result when no tier supplies a source", async () => {
    await expect(resolveFrontlineSource({ preferences: preferences({}), registry })).resolves.toEqual({
      source: null,
      sourceTier: "unbound",
      diagnostics: [],
    });
  });

  it.each([
    ["malformed", "bad source", "malformed-source-id"],
    ["unregistered", "missing-source", "unregistered-source-id"],
  ])("diagnoses %s invocation IDs and resolves unbound", async (_case, sourceId, code) => {
    const reader = preferences({ developer: ["fresh-agent"], project: ["review-cli"] });
    const result = await resolveFrontlineSource({ invocationSourceId: sourceId, preferences: reader, registry });

    expect(result).toEqual({
      source: null,
      sourceTier: "unbound",
      diagnostics: [{ code, tier: "invocation", sourceId }],
    });
    expect(reader.readDeveloperSourceIds).not.toHaveBeenCalled();
  });

  it("diagnoses invalid stored preferences while continuing the fallback chain", async () => {
    const result = await resolveFrontlineSource({
      preferences: preferences({ developer: ["bad source"], project: ["missing-source"] }),
      registry,
    });

    expect(result).toEqual({
      source: null,
      sourceTier: "unbound",
      diagnostics: [
        { code: "malformed-source-id", tier: "developer", sourceId: "bad source" },
        { code: "unregistered-source-id", tier: "project", sourceId: "missing-source" },
      ],
    });
  });

  it("selects the first registered source from each ordered preference list", async () => {
    const result = await resolveFrontlineSource({
      preferences: preferences({
        developer: ["missing-source", "fresh-agent", "review-cli"],
        project: ["review-cli"],
      }),
      registry,
    });

    expect(result).toEqual({
      source: registry.resolve("fresh-agent"),
      sourceTier: "developer",
      diagnostics: [{
        code: "unregistered-source-id",
        tier: "developer",
        sourceId: "missing-source",
      }],
    });
  });

  it("keeps preference read failure visible while using a lower tier", async () => {
    const result = await resolveFrontlineSource({
      preferences: {
        readDeveloperSourceIds: vi.fn().mockRejectedValue(new Error("storage unavailable")),
        readProjectSourceIds: vi.fn().mockResolvedValue(["review-cli"]),
      },
      registry,
    });

    expect(result).toEqual({
      source: registry.resolve("review-cli"),
      sourceTier: "project",
      diagnostics: [{ code: "preference-read-failed", tier: "developer" }],
    });
  });
});
