import { describe, expect, it } from "vitest";

import {
  reduceExclusiveTriggerWindow,
  type ExclusiveTriggerWindow,
  type TriggerEvent,
} from "../../../../../src/scripts/review-gate/core/trigger-window.js";

const HEAD = "a".repeat(40);
const DIGEST = "b".repeat(64);

const window: ExclusiveTriggerWindow = {
  schemaVersion: 1,
  requestKey: "c".repeat(64),
  providerIdentity: "provider-1",
  generation: 0,
  headSha: HEAD,
  ownedTrigger: {
    eventId: "comment-10",
    actorIdentity: "actor-1",
    contentDigest: DIGEST,
    occurredAt: "2026-07-12T20:00:00.000Z",
  },
};

function event(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    schemaVersion: 1,
    eventId: "comment-10",
    providerIdentity: "provider-1",
    classification: "trigger",
    eventKind: "comment",
    actorIdentity: "actor-1",
    contentDigest: DIGEST,
    occurredAt: "2026-07-12T20:00:00.000Z",
    observedHeadSha: HEAD,
    ownership: "controller-owned",
    mutation: "created",
    terminalForEventId: null,
    authenticatedEventRef: "event:comment-10",
    ...overrides,
  };
}

describe("exclusive trigger windows", () => {
  it("accepts terminal proof only after the exact immutable owned trigger", () => {
    const terminal = event({
      eventId: "review-20",
      classification: "terminal",
      eventKind: "review",
      actorIdentity: "provider-bot",
      contentDigest: "d".repeat(64),
      occurredAt: "2026-07-12T20:10:00.000Z",
      ownership: "provider",
      mutation: "observed",
      terminalForEventId: "comment-10",
      authenticatedEventRef: "event:review-20",
    });
    expect(reduceExclusiveTriggerWindow(window, [event(), terminal])).toEqual({
      status: "terminal",
      satisfiable: true,
      liveEffectEventIds: [],
      contamination: [],
      terminalEventId: "review-20",
    });
  });

  it("orders an owned trigger before terminal evidence when host timestamps have equal precision", () => {
    const terminal = event({
      eventId: "provider-evidence:review-20",
      classification: "terminal",
      eventKind: "review",
      actorIdentity: "provider-bot",
      contentDigest: "d".repeat(64),
      ownership: "provider",
      mutation: "observed",
      terminalForEventId: "comment-10",
      authenticatedEventRef: "event:review-20",
    });
    expect(reduceExclusiveTriggerWindow(window, [terminal, event()])).toMatchObject({
      status: "terminal",
      satisfiable: true,
      terminalEventId: "provider-evidence:review-20",
    });
  });

  it("contaminates unowned and competing triggers instead of attributing by time and head", () => {
    const unowned = event({
      eventId: "comment-11",
      actorIdentity: "actor-2",
      contentDigest: "e".repeat(64),
      occurredAt: "2026-07-12T20:01:00.000Z",
      ownership: "unowned",
      authenticatedEventRef: "event:comment-11",
    });
    expect(reduceExclusiveTriggerWindow(window, [event(), unowned])).toEqual({
      status: "contaminated",
      satisfiable: false,
      liveEffectEventIds: ["comment-10", "comment-11"],
      contamination: ["competing-trigger:comment-11"],
      terminalEventId: null,
    });
  });

  it.each(["edited", "deleted"] as const)("keeps an owned %s trigger contaminated after terminal release", (mutation) => {
    const mutationEvent = event({
      eventId: `comment-10:${mutation}`,
      occurredAt: "2026-07-12T20:02:00.000Z",
      mutation,
      terminalForEventId: "comment-10",
      authenticatedEventRef: `event:comment-10:${mutation}`,
    });
    const terminal = event({
      eventId: "review-20",
      classification: "terminal",
      eventKind: "review",
      actorIdentity: "provider-bot",
      contentDigest: "d".repeat(64),
      occurredAt: "2026-07-12T20:10:00.000Z",
      ownership: "provider",
      mutation: "observed",
      terminalForEventId: "comment-10",
      authenticatedEventRef: "event:review-20",
    });
    expect(reduceExclusiveTriggerWindow(window, [event(), mutationEvent, terminal])).toMatchObject({
      status: "contaminated",
      satisfiable: false,
      liveEffectEventIds: [],
      contamination: [`owned-trigger-${mutation}:comment-10`],
      terminalEventId: "review-20",
    });
  });

  it("fails closed for an owned event whose actor, digest, or observed head drifts", () => {
    expect(reduceExclusiveTriggerWindow(window, [event({ actorIdentity: "actor-2" })]).contamination)
      .toContain("owned-trigger-identity-mismatch:comment-10");
    expect(reduceExclusiveTriggerWindow(window, [event({ contentDigest: "f".repeat(64) })]).contamination)
      .toContain("owned-trigger-identity-mismatch:comment-10");
    expect(reduceExclusiveTriggerWindow(window, [event({ observedHeadSha: "f".repeat(40) })]).contamination)
      .toContain("owned-trigger-head-mismatch:comment-10");
  });

  it("permits a fully terminated earlier trigger but rejects a still-live old-head effect", () => {
    const prior = event({
      eventId: "comment-1", actorIdentity: "actor-2", ownership: "unowned",
      occurredAt: "2026-07-12T19:00:00.000Z", observedHeadSha: "f".repeat(40),
      authenticatedEventRef: "event:comment-1",
    });
    const priorTerminal = event({
      eventId: "review-2", classification: "terminal", eventKind: "review", ownership: "provider",
      mutation: "observed", terminalForEventId: "comment-1", occurredAt: "2026-07-12T19:30:00.000Z",
      authenticatedEventRef: "event:review-2",
    });
    expect(reduceExclusiveTriggerWindow(window, [prior, priorTerminal, event()]).contamination).toEqual([]);
    expect(reduceExclusiveTriggerWindow(window, [prior, event()])).toMatchObject({
      status: "contaminated",
      contamination: ["live-prior-trigger:comment-1"],
    });
  });
});
