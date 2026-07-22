/** Expected-state ordinary Errand identity transitions. */

import { describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  type TransientIdentityRecord,
} from "../../src/lib/errand/identity-record.js";
import {
  ordinaryErrandTransform,
  type OrdinaryErrandRecord,
  type PauseHeadEvidence,
} from "../../src/lib/errand/identity-transitions.js";
import type {
  ChangeRequestLifecycleEvidence,
  ChangeRequestLifecycleTruth,
} from "../../src/lib/errand/change-request-lifecycle.js";

const createdAt = "2026-07-18T00:00:00.000Z";
const updatedAt = "2026-07-18T00:01:00.000Z";
const claimId = "0123456789abcdef0123456789abcdef";
const head = "a".repeat(40);
const remoteTip = "b".repeat(40);
const changeRequest = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/fix-output",
  headSha: head,
};

function open(overrides: Record<string, unknown> = {}): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "errand",
    slug: "fix-output",
    claimId,
    purpose: "errand",
    origin: "description",
    originEntry: null,
    intent: "Fix output",
    branch: "chore/fix-output",
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }) as OrdinaryErrandRecord;
}

function apply(
  basis: ReadonlyMap<string, TransientIdentityRecord>,
  request: Parameters<typeof ordinaryErrandTransform>[0],
) {
  return ordinaryErrandTransform(request)(basis);
}

function pauseEvidence(overrides: Partial<PauseHeadEvidence> = {}): PauseHeadEvidence {
  return {
    terminalHead: head,
    remoteBranchTip: remoteTip,
    savedHeadIsAncestor: true,
    ...overrides,
  } as PauseHeadEvidence;
}

function lifecycleEvidence(
  kind: ChangeRequestLifecycleTruth,
  coordinates = changeRequest,
): ChangeRequestLifecycleEvidence {
  return { kind, changeRequest: coordinates } as ChangeRequestLifecycleEvidence;
}

describe("ordinary Errand identity transitions", () => {
  it("creates once and adopts an exact replay without rotating the claim", () => {
    const record = open();
    const created = apply(new Map(), { kind: "create", record });
    expect(created).toMatchObject({ kind: "applied", value: record });
    expect(apply(new Map([[record.slug, record]]), { kind: "create", record }))
      .toMatchObject({ kind: "idempotent", value: record });
    expect(apply(new Map([[record.slug, open({ claimId: "f".repeat(32) })]]), { kind: "create", record }))
      .toMatchObject({ kind: "refused" });
  });

  it("links a description origin exactly once and preserves its claim", () => {
    const previous = open();
    const decision = apply(new Map([[previous.slug, previous]]), {
      kind: "link",
      previous,
      originEntry: "Fix output capture",
      updatedAt,
    });
    expect(decision).toMatchObject({
      kind: "applied",
      value: { origin: "inbox", originEntry: "Fix output capture", claimId },
    });
    if (decision.kind !== "applied") throw new Error("expected applied link");
    expect(apply(decision.records, {
      kind: "link",
      previous,
      originEntry: "Fix output capture",
      updatedAt,
    })).toMatchObject({ kind: "idempotent" });
    expect(apply(new Map([[previous.slug, open({ origin: "inbox", originEntry: "other" })]]), {
      kind: "link", previous, originEntry: "Fix output capture", updatedAt,
    })).toMatchObject({ kind: "refused" });
  });

  it("accepts an exact late-link replay from the already-linked generation", () => {
    const previous = open({
      origin: "inbox",
      originEntry: "Fix output capture",
      updatedAt,
    });

    expect(apply(new Map([[previous.slug, previous]]), {
      kind: "link",
      previous,
      originEntry: "Fix output capture",
      updatedAt: "2026-07-18T00:02:00.000Z",
    })).toMatchObject({ kind: "idempotent", value: previous });
  });

  it("pauses only with the exact terminal head proven on the fetched remote branch", () => {
    const previous = open();
    const request = {
      kind: "pause" as const,
      previous,
      savedHead: head,
      evidence: pauseEvidence(),
      updatedAt,
    };
    const paused = apply(new Map([[previous.slug, previous]]), request);
    expect(paused).toMatchObject({
      kind: "applied",
      value: { state: "paused", savedHead: head, claimId },
    });
    if (paused.kind !== "applied") throw new Error("expected applied pause");
    expect(apply(paused.records, request)).toMatchObject({ kind: "idempotent" });
    expect(apply(new Map([[previous.slug, previous]]), {
      ...request,
      evidence: pauseEvidence({ terminalHead: remoteTip }),
    })).toMatchObject({ kind: "refused" });
    expect(apply(new Map([[previous.slug, previous]]), {
      ...request,
      evidence: pauseEvidence({ savedHeadIsAncestor: false }),
    })).toMatchObject({ kind: "refused" });
  });

  it("records awaiting-merge only for exact repository, base, branch, and head coordinates", () => {
    const previous = open();
    const request = {
      kind: "await-merge" as const,
      previous,
      changeRequest,
      configured: {
        repositoryRef: "owner/repo",
        hostRef: "github.com",
        baseRef: "main",
      },
      observed: {
        repositoryRef: "owner/repo",
        hostRef: "github.com",
        baseRef: "main",
        headRef: previous.branch,
        headSha: head,
      },
      updatedAt,
    };
    const awaiting = apply(new Map([[previous.slug, previous]]), request);
    expect(awaiting).toMatchObject({
      kind: "applied",
      value: { state: "awaiting-merge", changeRequest, claimId },
    });
    if (awaiting.kind !== "applied") throw new Error("expected applied awaiting-merge");
    expect(apply(awaiting.records, request)).toMatchObject({ kind: "idempotent" });
    expect(apply(new Map([[previous.slug, previous]]), {
      ...request,
      observed: { ...request.observed, headSha: remoteTip },
    })).toMatchObject({ kind: "refused" });
    expect(apply(new Map([[previous.slug, previous]]), {
      ...request,
      configured: { ...request.configured, repositoryRef: "other/repo" },
    })).toMatchObject({ kind: "refused" });
  });

  it("resumes a paused generation to open without changing its immutable fields", () => {
    const previous = open({ state: "paused", savedHead: head });
    const request = { kind: "resume" as const, previous, authorization: pauseEvidence(), updatedAt };
    const resumed = apply(new Map([[previous.slug, previous]]), request);
    expect(resumed).toMatchObject({
      kind: "applied",
      value: { state: "open", savedHead: null, claimId, createdAt },
    });
    if (resumed.kind !== "applied") throw new Error("expected applied resume");
    expect(apply(resumed.records, request)).toMatchObject({ kind: "idempotent" });
  });

  it("resumes an awaiting generation from exact open or advisory host truth", () => {
    const previous = open({ state: "awaiting-merge", changeRequest, updatedAt });
    const resumedAt = "2026-07-18T00:02:00.000Z";
    for (const kind of ["requested-work", "open", "changed-head", "unreachable"] as const) {
      expect(apply(new Map([[previous.slug, previous]]), {
        kind: "resume",
        previous,
        authorization: lifecycleEvidence(kind),
        updatedAt: resumedAt,
      })).toMatchObject({
        kind: "applied",
        value: { state: "open", changeRequest: null, claimId },
      });
    }
    for (const kind of ["merged", "closed-unmerged", "missing", "ambiguous"] as const) {
      expect(apply(new Map([[previous.slug, previous]]), {
        kind: "resume",
        previous,
        authorization: lifecycleEvidence(kind),
        updatedAt: resumedAt,
      })).toMatchObject({ kind: "refused" });
    }
  });

  it("retires only along state-authorized promotion, close, and abandonment edges", () => {
    const openRecord = open();
    const promotion = { kind: "retire" as const, previous: openRecord, reason: "promotion" as const,
      authorization: "local" as const };
    expect(apply(new Map([[openRecord.slug, openRecord]]), promotion))
      .toMatchObject({ kind: "applied", value: null });
    expect(apply(new Map(), promotion)).toMatchObject({ kind: "idempotent", value: null });
    expect(apply(new Map([[openRecord.slug, openRecord]]), {
      kind: "retire", previous: openRecord, reason: "abandon", authorization: "local",
    })).toMatchObject({ kind: "applied" });

    const paused = open({ state: "paused", savedHead: head });
    expect(apply(new Map([[paused.slug, paused]]), {
      kind: "retire", previous: paused, reason: "abandon", authorization: "local",
    })).toMatchObject({ kind: "applied" });
    expect(apply(new Map([[paused.slug, paused]]), {
      kind: "retire", previous: paused, reason: "promotion", authorization: "local",
    })).toMatchObject({ kind: "refused" });

    const awaiting = open({ state: "awaiting-merge", changeRequest, updatedAt });
    const close = {
      kind: "retire" as const,
      previous: awaiting,
      reason: "close" as const,
      lifecycle: lifecycleEvidence("merged"),
    };
    expect(apply(new Map([[awaiting.slug, awaiting]]), close)).toMatchObject({ kind: "applied" });
    expect(apply(new Map(), close)).toMatchObject({ kind: "idempotent" });
    const abandonTail = { kind: "retire" as const, previous: awaiting, reason: "abandon" as const,
      lifecycle: lifecycleEvidence("closed-unmerged") };
    expect(apply(new Map([[awaiting.slug, awaiting]]), abandonTail)).toMatchObject({ kind: "applied" });
    expect(apply(new Map(), abandonTail)).toMatchObject({ kind: "idempotent" });
    expect(apply(new Map([[awaiting.slug, awaiting]]), {
      kind: "retire", previous: awaiting, reason: "close", lifecycle: lifecycleEvidence("open"),
    })).toMatchObject({ kind: "refused" });
    expect(apply(new Map([[awaiting.slug, awaiting]]), {
      kind: "retire",
      previous: awaiting,
      reason: "close",
      lifecycle: lifecycleEvidence("merged", { ...changeRequest, headSha: remoteTip }),
    })).toMatchObject({ kind: "refused" });
  });

  it("refuses stale generations, illegal edges, and non-advancing timestamps", () => {
    const previous = open();
    expect(apply(new Map([[previous.slug, open({ claimId: "f".repeat(32) })]]), {
      kind: "pause",
      previous,
      savedHead: head,
      evidence: pauseEvidence(),
      updatedAt,
    })).toMatchObject({ kind: "refused" });
    expect(apply(new Map([[previous.slug, previous]]), {
      kind: "resume", previous, authorization: pauseEvidence(), updatedAt,
    })).toMatchObject({ kind: "refused" });
    const paused = open({ state: "paused", savedHead: head });
    expect(apply(new Map([[paused.slug, open({
      state: "paused",
      savedHead: head,
      claimId: "f".repeat(32),
    })]]), {
      kind: "resume", previous: paused, authorization: pauseEvidence(), updatedAt,
    })).toMatchObject({ kind: "refused" });
    expect(apply(new Map([[previous.slug, previous]]), {
      kind: "pause",
      previous,
      savedHead: head,
      evidence: pauseEvidence(),
      updatedAt: previous.updatedAt,
    })).toMatchObject({ kind: "refused" });
  });
});
