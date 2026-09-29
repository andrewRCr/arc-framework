/** Strict v3 transient identity record schema coverage. */

import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../helpers/schema-assertion.js";

import {
  TransientIdentityRecordSchema,
  TransientIdentityRecordV3Schema,
  deserializeTransientIdentityRecord,
  mintClaimId,
  projectLocusIdentity,
  serializeTransientIdentityRecord,
} from "../../src/lib/errand/identity-record.js";

const timestamp = "2026-07-18T00:00:00.000Z";
const claimId = "0123456789abcdef0123456789abcdef";
const sourceDigest = `sha256:${"b".repeat(64)}`;
const head = "a".repeat(40);
const changeRequest = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/fix-output",
  headSha: head,
};

function ordinary(overrides: Record<string, unknown> = {}): unknown {
  return {
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
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function legacy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    slug: "legacy",
    origin: "description",
    intent: "Close legacy",
    branch: "chore/legacy",
    createdAt: timestamp,
    ...overrides,
  };
}

describe("v3 transient identity records", () => {
  it.each([1, 2] as const)("rejects retired v%d identity records", (version) => {
    expect(deserializeTransientIdentityRecord(
      JSON.stringify(legacy({ version })),
      "legacy",
    )).toEqual({ kind: "unknown-version", version });
  });

  it("round-trips every ordinary Errand lifecycle arm", () => {
    const values = [
      ordinary(),
      ordinary({ state: "paused", savedHead: head }),
      ordinary({ state: "awaiting-merge", changeRequest }),
      ordinary({ origin: "inbox", originEntry: "Fix output", originEntrySourceDigest: sourceDigest }),
    ];
    for (const value of values) {
      const parsed = TransientIdentityRecordSchema.parse(value);
      expect(deserializeTransientIdentityRecord(serializeTransientIdentityRecord(parsed), parsed.slug))
        .toEqual({ kind: "valid", record: parsed });
    }
  });

  it("round-trips routing and full/partial groom arms", () => {
    const values: unknown[] = [
      {
        version: 3, kind: "errand", slug: "inbox-drain", claimId, purpose: "housekeep-routing",
        branch: "chore/inbox-drain", state: "open", savedHead: null, changeRequest: null,
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        version: 3, kind: "groom", slug: "groom-alpha", claimId, anchorStub: "alpha",
        members: ["alpha", "beta"], openedBaseHead: head, protection: "full", branch: "chore/groom-alpha",
        state: "awaiting-merge", changeRequest: { ...changeRequest, headRef: "chore/groom-alpha" },
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        version: 3, kind: "groom", slug: "groom-alpha", claimId, anchorStub: "alpha",
        members: ["alpha"], openedBaseHead: head, protection: "partial", branch: null,
        state: "open", changeRequest: null, createdAt: timestamp, updatedAt: timestamp,
      },
    ];
    for (const value of values) assertSchemaAccepts(TransientIdentityRecordSchema, value);
  });

  it("enforces origin, state, namespace, member, and exact-key relationships", () => {
    const invalid = [
      ordinary({ origin: "description", originEntry: "capture" }),
      ordinary({ origin: "inbox", originEntry: "capture" }),
      ordinary({ origin: "inbox", originEntry: "capture", originEntrySourceDigest: "not-a-digest" }),
      ordinary({ state: "paused", savedHead: null }),
      ordinary({ slug: "groom-alpha", branch: "chore/groom-alpha" }),
      ordinary({ slug: "Legacy Slug", branch: "chore/Legacy Slug" }),
      ordinary({ branch: "b".repeat(4_097) }),
      ordinary({ intent: "i".repeat(4_097) }),
      ordinary({ extra: true }),
      ordinary({ createdAt: "yesterday" }),
      ordinary({ updatedAt: "2026-07-17T00:00:00.000Z" }),
      ordinary({ state: "awaiting-merge", changeRequest: { ...changeRequest, headRef: "chore/other" } }),
      ordinary({ dispatchId: "legacy" }),
      {
        version: 3, kind: "errand", slug: "inbox-drain", claimId, purpose: "housekeep-routing",
        branch: "chore/inbox-drain", dispatchId: "legacy", state: "open", savedHead: null, changeRequest: null,
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        version: 3, kind: "groom", slug: "groom-alpha", claimId, anchorStub: "alpha",
        members: ["beta", "alpha"], openedBaseHead: head, protection: "partial", branch: null,
        state: "open", changeRequest: null, createdAt: timestamp, updatedAt: timestamp,
      },
    ];
    invalid.forEach((value, index) => {
      try {
        assertSchemaRefuses(TransientIdentityRecordSchema, value);
      } catch (error) {
        throw new Error(`invalid case ${index}`, { cause: error });
      }
    });
    expect(deserializeTransientIdentityRecord(JSON.stringify(ordinary()), "different-key"))
      .toMatchObject({ kind: "key-mismatch" });
  });

  it("preserves claim generation in the locus projection", () => {
    const record = TransientIdentityRecordV3Schema.parse(ordinary());
    expect(projectLocusIdentity(record)).toMatchObject({ kind: "errand", key: "fix-output", claimId });
    const first = mintClaimId();
    const second = mintClaimId();
    expect(first).toMatch(/^[0-9a-f]{32}$/u);
    expect(second).not.toBe(first);
  });

  it("preserves an inbox source generation in the locus projection", () => {
    const record = TransientIdentityRecordV3Schema.parse(ordinary({
      origin: "inbox",
      originEntry: "Fix output",
      originEntrySourceDigest: sourceDigest,
    }));

    expect(projectLocusIdentity(record)).toMatchObject({
      origin: "inbox",
      originEntry: "Fix output",
      originEntrySourceDigest: sourceDigest,
    });
  });
});

describe("invalid identity records", () => {
  it("distinguishes malformed and unknown versions", () => {
    expect(deserializeTransientIdentityRecord("{bad", "x")).toMatchObject({ kind: "malformed" });
    expect(deserializeTransientIdentityRecord(JSON.stringify({ version: 99 }), "x"))
      .toEqual({ kind: "unknown-version", version: 99 });
  });
});
