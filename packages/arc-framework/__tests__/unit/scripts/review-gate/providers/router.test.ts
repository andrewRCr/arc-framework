import { describe, expect, it, vi } from "vitest";

import type { ReviewProviderAdapter } from "../../../../../src/scripts/review-gate/core/ports.js";
import { QualifiedProviderRouter } from "../../../../../src/scripts/review-gate/providers/router.js";

function adapter(sourceIdentity: string): ReviewProviderAdapter {
  const readCapacity = vi.fn<ReviewProviderAdapter["readCapacity"]>(async () => ({ schemaVersion: 1, sourceIdentity, status: "available", reason: "provider-reported", provenance: "test", observedAt: "2026-07-12T00:00:00.000Z" }));
  const request = vi.fn<ReviewProviderAdapter["request"]>(async () => ({ requestIdentity: "request", acknowledgedAt: "2026-07-12T00:00:00.000Z", trigger: { eventKind: "comment", eventId: "event", actorIdentity: "actor", contentDigest: "digest", occurredAt: "2026-07-12T00:00:00.000Z", headSha: "a".repeat(40) } }));
  const observe = vi.fn<ReviewProviderAdapter["observe"]>(async (requestIdentity) => [{ schemaVersion: 1, requestIdentity, sourceIdentity, observedAt: "2026-07-12T00:00:00.000Z", opaqueRef: "{}" }]);
  return {
    readCapacity,
    qualifyRequest: vi.fn(async () => ({ qualified: true, reason: "qualified" })),
    request,
    observe,
    normalizeEvidence: vi.fn(async () => []),
  };
}

describe("QualifiedProviderRouter", () => {
  it("recovers observation routing from the durable request identity resolver", async () => {
    const coderabbit = adapter("coderabbit-pr");
    const codex = adapter("codex-pr");
    const router = new QualifiedProviderRouter({
      adapters: new Map([["coderabbit-pr", coderabbit], ["codex-pr", codex]]),
      resolveSource: async (identity) => identity === "codex-request" ? "codex-pr" : null,
    });
    await expect(router.observe("codex-request")).resolves.toEqual([expect.objectContaining({ sourceIdentity: "codex-pr" })]);
    expect(codex.observe).toHaveBeenCalledWith("codex-request");
    expect(coderabbit.observe).not.toHaveBeenCalled();
  });

  it("rejects observation batches that cross provider authority", async () => {
    const router = new QualifiedProviderRouter({ adapters: new Map([["codex-pr", adapter("codex-pr")]]), resolveSource: async () => "codex-pr" });
    await expect(router.normalizeEvidence([
      { schemaVersion: 1, requestIdentity: "one", sourceIdentity: "codex-pr", observedAt: "2026-07-12T00:00:00.000Z", opaqueRef: "{}" },
      { schemaVersion: 1, requestIdentity: "two", sourceIdentity: "coderabbit-pr", observedAt: "2026-07-12T00:00:00.000Z", opaqueRef: "{}" },
    ])).rejects.toThrow("mixed-source");
  });
});
