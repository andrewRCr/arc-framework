/** Exact v3 ordinary-Errand late-link transition. */

import { describe, expect, it, vi } from "vitest";

import { linkOrdinaryErrand } from "../../../src/lib/errand/link.js";
import {
  TransientIdentityRecordV3Schema,
  type TransientIdentityRecord,
} from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { IdentityTransactionOutcome } from "../../../src/lib/errand/identity-transaction.js";

const previous = TransientIdentityRecordV3Schema.parse({
  version: 3,
  kind: "errand",
  slug: "fix-output",
  claimId: "0123456789abcdef0123456789abcdef",
  purpose: "errand",
  origin: "description",
  originEntry: null,
  intent: "Fix output",
  branch: "chore/fix-output",
  state: "open",
  savedHead: null,
  changeRequest: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
}) as OrdinaryErrandRecord;

const inbox = {
  title: "Fix output capture",
  sourceDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`,
  executeBound: false,
};

function basis(
  record: TransientIdentityRecord | null = previous,
): IdentityTransactionOutcome<TransientIdentityRecord | null> {
  return { kind: "idempotent", value: record, tip: "c".repeat(40) };
}

describe("linkOrdinaryErrand", () => {
  it("uses the canonical slug to resolve an identity", async () => {
    const result = await linkOrdinaryErrand({
      slug: `  ${previous.slug}  `,
      inbox,
      updatedAt: "2026-07-18T00:01:00.000Z",
      dependencies: {
        readIdentity: async (slug) => basis(slug === previous.slug ? previous : null),
        transact: async () => ({ kind: "applied", value: {
          ...previous,
          origin: "inbox",
          originEntry: inbox.title,
          originEntrySourceDigest: inbox.sourceDigest,
          updatedAt: "2026-07-18T00:01:00.000Z",
        }, tip: "a".repeat(40) }),
      },
    });

    expect(result).toMatchObject({ outcome: "applied", identity: { key: previous.slug } });
  });

  it("adopts a live inbox generation through the exact identity transaction", async () => {
    const linked = { ...previous, origin: "inbox" as const, originEntry: "Fix output capture",
      originEntrySourceDigest: inbox.sourceDigest,
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const transact = vi.fn().mockResolvedValue({ kind: "applied", value: linked, tip: "a".repeat(40) });

    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: linked.updatedAt,
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact,
      },
    });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-link",
      originEntry: "Fix output capture",
      identity: { claimId: previous.claimId },
    });
    expect(transact).toHaveBeenCalledWith(expect.objectContaining({
      originEntry: inbox.title,
      originEntrySourceDigest: inbox.sourceDigest,
    }));
  });

  it("reports an exact same-entry replay as idempotent", async () => {
    const linked = { ...previous, origin: "inbox" as const, originEntry: inbox.title,
      originEntrySourceDigest: inbox.sourceDigest,
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis(linked)),
        transact: vi.fn().mockResolvedValue({ kind: "idempotent", value: linked, tip: "a".repeat(40) }),
      },
    });

    expect(result).toMatchObject({
      outcome: "idempotent",
      originEntry: inbox.title,
    });
  });

  it("refuses a different existing inbox origin before mutation", async () => {
    const linked = { ...previous, origin: "inbox" as const, originEntry: "Other capture",
      originEntrySourceDigest: `sha256:${"a".repeat(64)}` as const,
      updatedAt: "2026-07-18T00:01:00.000Z" };
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis(linked)),
        transact: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "inbox-link-conflict" });
  });

  it("refuses a same-title replacement generation before mutation", async () => {
    const linked = {
      ...previous,
      origin: "inbox" as const,
      originEntry: inbox.title,
      originEntrySourceDigest: `sha256:${"a".repeat(64)}` as const,
      updatedAt: "2026-07-18T00:01:00.000Z",
    };
    const transact = vi.fn();

    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis(linked)),
        transact,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "inbox-link-conflict" });
    expect(transact).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", basis(null), {
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: `Errand identity '${previous.slug}' does not exist.`,
    }],
    ["refused", { kind: "refused", reason: "Identity basis changed" }, {
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: "Identity basis changed",
    }],
    ["invalid", { kind: "error", stage: "basis", message: "Identity basis contains invalid entries" }, {
      outcome: "error",
      error: {
        code: "locus.errand-link.basis",
        message: "Identity basis contains invalid entries",
      },
    }],
  ] satisfies Array<[
    string,
    IdentityTransactionOutcome<TransientIdentityRecord | null>,
    Record<string, unknown>,
  ]>)("returns the exact %s identity-basis outcome", async (_label, identityBasis, expected) => {
    const transact = vi.fn();
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(identityBasis),
        transact,
      },
    });

    expect(result).toMatchObject(expected);
    expect(transact).not.toHaveBeenCalled();
  });

  it("refuses an empty slug before reading identity state", async () => {
    const readIdentity = vi.fn();

    const result = await linkOrdinaryErrand({
      slug: "   ",
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: { readIdentity, transact: vi.fn() },
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: "Errand slug must be non-empty.",
    });
    expect(readIdentity).not.toHaveBeenCalled();
  });

  it("refuses a non-open ordinary Errand before mutation", async () => {
    const transact = vi.fn();
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis(TransientIdentityRecordV3Schema.parse({
          ...previous,
          state: "paused",
          savedHead: "a".repeat(40),
        }))),
        transact,
      },
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: `Errand '${previous.slug}' is not open.`,
    });
    expect(transact).not.toHaveBeenCalled();
  });

  it("reports a thrown identity read at the basis boundary", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: async () => { throw new Error("read failed"); },
        transact: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: { code: "locus.errand-link.basis", message: "read failed" },
    });
  });

  it("refuses when the exact claim generation changes during the transaction", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact: vi.fn().mockResolvedValue({
          kind: "refused",
          reason: `Identity '${previous.slug}' no longer matches the expected generation and state`,
        }),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
  });

  it("reports a transaction-stage error exactly", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact: vi.fn().mockResolvedValue({ kind: "error", stage: "push", message: "push failed" }),
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: { code: "locus.errand-link.push", message: "push failed" },
    });
  });

  it("reports a transaction that returns no identity record", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact: vi.fn().mockResolvedValue({ kind: "idempotent", value: null, tip: "a".repeat(40) }),
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: {
        code: "locus.errand-link.identity",
        message: "Identity transaction returned no record",
      },
    });
  });

  it("reports a thrown identity transaction at its boundary", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact: async () => { throw new Error("transaction failed"); },
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: { code: "locus.errand-link.identity", message: "transaction failed" },
    });
  });

  it("preserves an inbox-link conflict discovered by the transaction", async () => {
    const result = await linkOrdinaryErrand({
      slug: previous.slug,
      inbox,
      updatedAt: "2026-07-18T00:02:00.000Z",
      dependencies: {
        readIdentity: vi.fn().mockResolvedValue(basis()),
        transact: vi.fn().mockResolvedValue({
          kind: "refused",
          reason: "Errand is already linked to a different inbox capture",
        }),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "inbox-link-conflict" });
  });
});
