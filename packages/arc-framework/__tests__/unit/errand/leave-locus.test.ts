/** Full-protection ordinary-Errand leave composition. */

import { describe, expect, it, vi } from "vitest";

import { leaveOrdinaryErrand } from "../../../src/lib/errand/leave.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord, PauseHeadEvidence } from "../../../src/lib/errand/identity-transitions.js";

const record = TransientIdentityRecordV3Schema.parse({
  version: 3,
  kind: "errand",
  slug: "fix-output",
  claimId: "0123456789abcdef0123456789abcdef",
  purpose: "errand",
  origin: "description",
  originEntry: null,
  dispatchId: null,
  intent: "Fix output",
  branch: "chore/fix-output",
  state: "open",
  savedHead: null,
  changeRequest: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
}) as OrdinaryErrandRecord;

describe("leaveOrdinaryErrand", () => {
  it("persists an exact pause before restoring the parent and popping occupancy", async () => {
    const paused = { ...record, state: "paused" as const, savedHead: "a".repeat(40),
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "full",
      updatedAt: paused.updatedAt,
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: record, tip: "b".repeat(40) }),
        authorize: vi.fn().mockResolvedValue({
          kind: "authorized",
          transition: {
            kind: "pause",
            previous: record,
            savedHead: paused.savedHead,
            evidence: {
              terminalHead: paused.savedHead,
              remoteBranchTip: paused.savedHead,
              savedHeadIsAncestor: true,
            } as PauseHeadEvidence,
            updatedAt: paused.updatedAt,
          },
        }),
        persist: vi.fn().mockResolvedValue({ kind: "applied", value: paused, tip: "c".repeat(40) }),
        cleanup: vi.fn().mockResolvedValue({
          kind: "applied",
          allocation: { kind: "spawned", checkoutPath: "/repo-locus" },
          recordId: `sha256:${"d".repeat(64)}`,
          restoredParent: { recordId: `sha256:${"e".repeat(64)}`, checkoutPath: "/repo-wu" },
        }),
      },
    });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-leave",
      identity: { state: "paused", claimId: record.claimId },
      restoredParent: { checkoutPath: "/repo-wu" },
      activeLocusPath: null,
      sessionHomePath: "/repo-wu",
    });
  });

  it("refuses partial-mode leave before reading identity or local occupancy", async () => {
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "partial",
      updatedAt: "2026-07-18T00:01:00.000Z",
      dependencies: {
        readIdentity: vi.fn(),
        authorize: vi.fn(),
        persist: vi.fn(),
        cleanup: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "full-protection-required" });
  });

  it("retains local occupancy when identity persistence fails", async () => {
    const cleanup = vi.fn();
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "full",
      updatedAt: "2026-07-18T00:01:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: record, tip: "b".repeat(40) }),
        authorize: vi.fn().mockResolvedValue({
          kind: "authorized",
          transition: {
            kind: "pause",
            previous: record,
            savedHead: "a".repeat(40),
            evidence: {
              terminalHead: "a".repeat(40),
              remoteBranchTip: "a".repeat(40),
              savedHeadIsAncestor: true,
            } as PauseHeadEvidence,
            updatedAt: "2026-07-18T00:01:00.000Z",
          },
        }),
        persist: vi.fn().mockResolvedValue({ kind: "error", stage: "push", message: "remote unavailable" }),
        cleanup,
      },
    });

    expect(result).toMatchObject({ outcome: "error", error: { code: "locus.errand-leave.push" } });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("retains the persisted tail when exact local role cleanup refuses", async () => {
    const paused = { ...record, state: "paused" as const, savedHead: "a".repeat(40),
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "full",
      updatedAt: paused.updatedAt,
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: record, tip: "b".repeat(40) }),
        authorize: vi.fn().mockResolvedValue({
          kind: "authorized",
          transition: {
            kind: "pause",
            previous: record,
            savedHead: paused.savedHead,
            evidence: {
              terminalHead: paused.savedHead,
              remoteBranchTip: paused.savedHead,
              savedHeadIsAncestor: true,
            } as PauseHeadEvidence,
            updatedAt: paused.updatedAt,
          },
        }),
        persist: vi.fn().mockResolvedValue({ kind: "applied", value: paused, tip: "c".repeat(40) }),
        cleanup: vi.fn().mockResolvedValue({
          kind: "refused",
          reason: "lease-generation-mismatch",
          message: "The local lease generation changed.",
        }),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-generation-mismatch" });
  });

  it("replays an already-persisted tail and already-cleaned occupancy idempotently", async () => {
    const paused = { ...record, state: "paused" as const, savedHead: "a".repeat(40),
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "full",
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: paused, tip: "b".repeat(40) }),
        authorize: vi.fn(),
        persist: vi.fn(),
        cleanup: vi.fn().mockResolvedValue({
          kind: "idempotent",
          allocation: null,
          recordId: null,
          restoredParent: null,
        }),
      },
    });

    expect(result).toMatchObject({
      outcome: "idempotent",
      identity: { state: "paused", claimId: record.claimId },
      restoredParent: null,
    });
  });

  it("reports a cold primary restoration without inventing a parent frame", async () => {
    const paused = { ...record, state: "paused" as const, savedHead: "a".repeat(40),
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "paused",
      protection: "full",
      updatedAt: paused.updatedAt,
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: paused, tip: "b".repeat(40) }),
        authorize: vi.fn(),
        persist: vi.fn(),
        cleanup: vi.fn().mockResolvedValue({
          kind: "applied",
          allocation: { kind: "primary", checkoutPath: "/repo" },
          recordId: `sha256:${"d".repeat(64)}`,
          restoredParent: null,
        }),
      },
    });

    expect(result).toMatchObject({
      outcome: "applied",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      restoredParent: null,
      sessionHomePath: null,
    });
  });

  it("persists exact awaiting-merge coordinates before local cleanup", async () => {
    const changeRequest = {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: record.branch,
      headSha: "a".repeat(40),
    };
    const awaiting = { ...record, state: "awaiting-merge" as const, changeRequest,
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await leaveOrdinaryErrand({
      slug: record.slug,
      state: "awaiting-merge",
      protection: "full",
      updatedAt: awaiting.updatedAt,
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue({ kind: "idempotent", value: record, tip: "b".repeat(40) }),
        authorize: vi.fn().mockResolvedValue({
          kind: "authorized",
          transition: {
            kind: "await-merge",
            previous: record,
            changeRequest,
            configured: {
              repositoryRef: changeRequest.repositoryRef,
              hostRef: changeRequest.hostRef,
              baseRef: changeRequest.baseRef,
            },
            observed: changeRequest,
            updatedAt: awaiting.updatedAt,
          },
        }),
        persist: vi.fn().mockResolvedValue({ kind: "applied", value: awaiting, tip: "c".repeat(40) }),
        cleanup: vi.fn().mockResolvedValue({
          kind: "applied",
          allocation: { kind: "spawned", checkoutPath: "/repo-locus" },
          recordId: `sha256:${"d".repeat(64)}`,
          restoredParent: null,
        }),
      },
    });

    expect(result).toMatchObject({
      outcome: "applied",
      identity: { state: "awaiting-merge", changeRequest },
    });
  });
});
