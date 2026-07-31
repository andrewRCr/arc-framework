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

  it("refuses missing, legacy, and incomplete identity bases", async () => {
    const cases: Array<IdentityTransactionOutcome<TransientIdentityRecord | null>> = [
      basis(null),
      basis({
        version: 1,
        slug: previous.slug,
        origin: "description",
        intent: "Fix output",
        branch: previous.branch,
        createdAt: previous.createdAt,
      }),
      basis({
        version: 2,
        slug: previous.slug,
        origin: "description",
        intent: "Fix output",
        branch: previous.branch,
        createdAt: previous.createdAt,
      }),
      { kind: "error", stage: "basis", message: "Identity basis contains invalid entries" },
    ];

    for (const basis of cases) {
      const result = await linkOrdinaryErrand({
        slug: previous.slug,
        inbox,
        updatedAt: "2026-07-18T00:02:00.000Z",
        dependencies: {
          readIdentity: vi.fn().mockResolvedValue(basis),
          transact: vi.fn(),
        },
      });
      expect(result.outcome).not.toBe("applied");
    }
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
});
