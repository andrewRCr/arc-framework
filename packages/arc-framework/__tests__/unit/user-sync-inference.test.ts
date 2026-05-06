/**
 * Unit tests for `inferUserSyncCause` — pure inference helper that classifies
 * the cause of user-notes-ref divergence from precomputed inputs.
 */

import { describe, it, expect } from "vitest";

import {
  inferUserSyncCause,
  type InferUserSyncCauseInput,
} from "../../src/lib/user-sync/index.js";

const FRESH_SAVED_AT = "2026-05-06T10:00:00Z";
const STALE_SAVED_AT = "2026-04-01T10:00:00Z";
const NOW_FRESH = Date.parse("2026-05-06T10:01:00Z");

function makeInput(overrides: Partial<InferUserSyncCauseInput> = {}): InferUserSyncCauseInput {
  return {
    refRelation: "diverged",
    localRefHash: "L",
    remoteRefHash: "R",
    sourceCommit: "S",
    savedAt: FRESH_SAVED_AT,
    latestNoteRefHistoryEntry: "S",
    headReachable: true,
    offline: false,
    now: NOW_FRESH,
    ...overrides,
  };
}

describe("inferUserSyncCause", () => {
  it("classifies remote-ahead refs as unfetched-local", () => {
    const result = inferUserSyncCause(makeInput({ refRelation: "remote-ahead" }));

    expect(result.cause).toBe("unfetched-local");
    expect(result.confidence).toBe("high");
  });

  it("classifies local-ahead with sourceCommit outside HEAD ancestry as concurrent-local-writer", () => {
    const result = inferUserSyncCause(
      makeInput({
        refRelation: "local-ahead",
        headReachable: false,
        latestNoteRefHistoryEntry: "OTHER",
      }),
    );

    expect(result.cause).toBe("concurrent-local-writer");
    expect(result.confidence).toBe("high");
  });

  it("classifies diverged refs as cross-machine", () => {
    const result = inferUserSyncCause(makeInput({ refRelation: "diverged" }));

    expect(result.cause).toBe("cross-machine");
    expect(result.confidence).toBe("high");
  });

  it("returns offline cause and offline confidence under offline mode regardless of ref signals", () => {
    const result = inferUserSyncCause(
      makeInput({
        offline: true,
        refRelation: "diverged",
        remoteRefHash: null,
      }),
    );

    expect(result.cause).toBe("offline");
    expect(result.confidence).toBe("offline");
  });

  it("returns unknown with low confidence when sourceCommit is null", () => {
    const result = inferUserSyncCause(
      makeInput({
        sourceCommit: null,
        refRelation: "diverged",
      }),
    );

    expect(result.cause).toBe("unknown");
    expect(result.confidence).toBe("low");
  });

  it("returns unknown with low confidence when sync-state is missing (sourceCommit null + savedAt null)", () => {
    const result = inferUserSyncCause(
      makeInput({
        sourceCommit: null,
        savedAt: null,
        latestNoteRefHistoryEntry: null,
        refRelation: "remote-ahead",
      }),
    );

    expect(result.cause).toBe("unknown");
    expect(result.confidence).toBe("low");
  });

  it("downgrades confidence to low when savedAt is stale but keeps cause stable", () => {
    const stale = inferUserSyncCause(
      makeInput({
        refRelation: "diverged",
        savedAt: STALE_SAVED_AT,
      }),
    );

    expect(stale.cause).toBe("cross-machine");
    expect(stale.confidence).toBe("low");
  });

  it("downgrades confidence to low when savedAt is missing but keeps cause stable", () => {
    const missing = inferUserSyncCause(
      makeInput({
        refRelation: "remote-ahead",
        savedAt: null,
      }),
    );

    expect(missing.cause).toBe("unfetched-local");
    expect(missing.confidence).toBe("low");
  });

  it("never flips a non-unknown cause to unknown based on savedAt recency alone", () => {
    const causesByRelation: Array<[InferUserSyncCauseInput["refRelation"], string, Partial<InferUserSyncCauseInput>]> = [
      ["remote-ahead", "unfetched-local", {}],
      ["diverged", "cross-machine", {}],
      [
        "local-ahead",
        "concurrent-local-writer",
        { headReachable: false, latestNoteRefHistoryEntry: "OTHER" },
      ],
    ];

    for (const [refRelation, expectedCause, extras] of causesByRelation) {
      const result = inferUserSyncCause(
        makeInput({ refRelation, savedAt: STALE_SAVED_AT, ...extras }),
      );
      expect(result.cause).toBe(expectedCause);
      expect(result.confidence).toBe("low");
    }
  });

  it("returns unknown defensively when called with refRelation=same (call site bypassed divergence gate)", () => {
    const result = inferUserSyncCause(makeInput({ refRelation: "same" }));

    expect(result.cause).toBe("unknown");
  });
});
