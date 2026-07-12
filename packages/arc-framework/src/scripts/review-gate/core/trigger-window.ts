/** PR-wide immutable trigger events and exclusive-window contamination reduction. */

export type TriggerEventKind = "comment" | "label" | "review";
export type TriggerMutation = "created" | "edited" | "deleted" | "applied" | "removed" | "observed";

export interface TriggerEvent {
  schemaVersion: 1;
  eventId: string;
  providerIdentity: string;
  classification: "trigger" | "terminal";
  eventKind: TriggerEventKind;
  actorIdentity: string;
  contentDigest: string;
  occurredAt: string;
  observedHeadSha: string;
  ownership: "controller-owned" | "unowned" | "provider";
  mutation: TriggerMutation;
  terminalForEventId: string | null;
  authenticatedEventRef: string;
}

export interface ExclusiveTriggerWindow {
  schemaVersion: 1;
  requestKey: string;
  providerIdentity: string;
  generation: number;
  headSha: string;
  ownedTrigger: {
    eventId: string;
    actorIdentity: string;
    contentDigest: string;
    occurredAt: string;
  };
}

export interface ExclusiveTriggerWindowResult {
  status: "open" | "terminal" | "contaminated";
  satisfiable: boolean;
  liveEffectEventIds: string[];
  contamination: string[];
  terminalEventId: string | null;
}

function ordered(events: readonly TriggerEvent[]): TriggerEvent[] {
  return [...events].sort((left, right) => {
    const time = left.occurredAt.localeCompare(right.occurredAt);
    return time === 0 ? left.eventId.localeCompare(right.eventId) : time;
  });
}

function startsEffect(event: TriggerEvent): boolean {
  return event.classification === "trigger" && (event.mutation === "created" || event.mutation === "applied");
}

/** Reduce one provider generation against complete PR-wide trigger and terminal history. */
export function reduceExclusiveTriggerWindow(
  window: ExclusiveTriggerWindow,
  events: readonly TriggerEvent[],
): ExclusiveTriggerWindowResult {
  const history = ordered(events.filter((event) => event.providerIdentity === window.providerIdentity));
  const effects = new Map<string, TriggerEvent>();
  const terminalByTrigger = new Map<string, TriggerEvent>();
  const contamination: string[] = [];
  let owned: TriggerEvent | null = null;

  for (const event of history) {
    if (startsEffect(event)) effects.set(event.eventId, event);
    if (event.classification === "terminal" && event.terminalForEventId !== null) {
      const trigger = effects.get(event.terminalForEventId);
      if (trigger !== undefined && event.occurredAt >= trigger.occurredAt) {
        effects.delete(event.terminalForEventId);
        terminalByTrigger.set(event.terminalForEventId, event);
      }
    }
    if (event.eventId === window.ownedTrigger.eventId && startsEffect(event)) owned = event;
    if (
      event.terminalForEventId === window.ownedTrigger.eventId
      && (event.mutation === "edited" || event.mutation === "deleted" || event.mutation === "removed")
    ) {
      contamination.push(`owned-trigger-${event.mutation}:${window.ownedTrigger.eventId}`);
    }
  }

  if (owned === null) {
    contamination.push(`owned-trigger-missing:${window.ownedTrigger.eventId}`);
  } else {
    if (
      owned.ownership !== "controller-owned"
      || owned.actorIdentity !== window.ownedTrigger.actorIdentity
      || owned.contentDigest !== window.ownedTrigger.contentDigest
      || owned.occurredAt !== window.ownedTrigger.occurredAt
    ) contamination.push(`owned-trigger-identity-mismatch:${window.ownedTrigger.eventId}`);
    if (owned.observedHeadSha !== window.headSha) {
      contamination.push(`owned-trigger-head-mismatch:${window.ownedTrigger.eventId}`);
    }
  }

  for (const event of history.filter(startsEffect)) {
    if (event.eventId === window.ownedTrigger.eventId) continue;
    const terminal = terminalByTrigger.get(event.eventId);
    if (event.occurredAt < window.ownedTrigger.occurredAt) {
      if (terminal === undefined || terminal.occurredAt >= window.ownedTrigger.occurredAt) {
        contamination.push(`live-prior-trigger:${event.eventId}`);
      }
    } else {
      contamination.push(`competing-trigger:${event.eventId}`);
    }
  }

  const terminal = terminalByTrigger.get(window.ownedTrigger.eventId) ?? null;
  if (
    terminal !== null
    && (terminal.observedHeadSha !== window.headSha || terminal.occurredAt < window.ownedTrigger.occurredAt)
  ) contamination.push(`owned-terminal-mismatch:${terminal.eventId}`);
  const uniqueContamination = [...new Set(contamination)];
  const liveEffectEventIds = [...effects.keys()].sort();
  if (uniqueContamination.length > 0) {
    return {
      status: "contaminated",
      satisfiable: false,
      liveEffectEventIds,
      contamination: uniqueContamination,
      terminalEventId: terminal?.eventId ?? null,
    };
  }
  if (terminal !== null) {
    return {
      status: "terminal",
      satisfiable: true,
      liveEffectEventIds,
      contamination: [],
      terminalEventId: terminal.eventId,
    };
  }
  return { status: "open", satisfiable: false, liveEffectEventIds, contamination: [], terminalEventId: null };
}
