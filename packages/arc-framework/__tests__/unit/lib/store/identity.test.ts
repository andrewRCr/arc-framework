/** Contract values retain record identity while rejecting invalid construction. */

import { describe, expect, it } from "vitest";
import {
  OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema, StateVersionSchema,
  FormatVersionSchema, recordReferences, referenceOwner, referenceKind, referenceKey, sameOwner,
} from "../../../../src/lib/store/identity.js";
import {
  WritePlacementSchema, WorkUnitReadPlacementSchema, ErrandReadPlacementSchema,
} from "../../../../src/lib/store/placement.js";

const uid = "11111111-1111-4111-8111-111111111111";
const otherUid = "22222222-2222-4222-8222-222222222222";
const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid });

describe("store identities and references", () => {
  it.each([
    { type: "work-item", name: "example", uid },
    { type: "work-item", name: "example" },
    { type: "cohort", name: "example", uid },
    { type: "project", name: "example", uid },
    { type: "person", name: "andrew" },
  ])("accepts a documented owner: %j", (value) => expect(OwnerIdentitySchema.safeParse(value).success).toBe(true));

  it.each([
    { type: "person", name: "andrew", uid },
    { type: "work-item", name: "../example" },
    { type: "work-item", name: "example", uid: "invalid" },
    { type: "branch", name: "example" },
    { type: "work-item", name: "example", formerSlugs: [] },
  ])("rejects an invalid owner: %j", (value) => expect(OwnerIdentitySchema.safeParse(value).success).toBe(false));

  it("distinguishes recreated names and keeps UID identity across rename", () => {
    expect(sameOwner(owner, OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: otherUid }))).toBe(false);
    expect(sameOwner(owner, OwnerIdentitySchema.parse({ type: "work-item", name: "renamed", uid }))).toBe(true);
    expect(sameOwner(owner, OwnerIdentitySchema.parse({ type: "cohort", name: "example", uid }))).toBe(false);
  });

  it("constructs and reads a singleton reference", () => {
    const reference = recordReferences["work-item/meta"](owner);
    expect(referenceOwner(reference)).toEqual(owner);
    expect(referenceKind(reference)).toBe("work-item/meta");
    expect(referenceKey(reference)).toBeUndefined();
  });

  it("keeps two keyed records apart under one owner", () => {
    const first = recordReferences["work-item/companion"](owner, "spec-prd");
    const second = recordReferences["work-item/companion"](owner, "spec-rfc");
    expect(first).not.toEqual(second);
    expect(referenceKey(first)).toBe("spec-prd");
    expect(referenceKey(second)).toBe("spec-rfc");
  });

  it.each([
    { owner, kind: "work-item/meta", key: "unexpected" },
    { owner, kind: "work-item/companion" },
    { owner, kind: "work-item/companion", key: "../bad" },
    { owner, kind: "personal/inbox" },
    { owner, kind: "unknown/meta" },
  ])("refuses a reference outside its declared shape: %j", (value) => {
    expect(RecordReferenceSchema.safeParse(value).success).toBe(false);
  });

  it("rejects singleton keys and missing keyed arguments at the constructor", () => {
    expect(() => {
      // @ts-expect-error Singleton construction has no key parameter.
      recordReferences["work-item/meta"](owner, "wrong");
    }).toThrow();
    expect(() => {
      // @ts-expect-error A companion requires its declared key.
      recordReferences["work-item/companion"](owner);
    }).toThrow();
  });

  it.each([RecordVersionSchema, StateVersionSchema])("keeps versions opaque and nonempty", (schema) => {
    expect(schema.safeParse("opaque-basis").success).toBe(true);
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
  });

  it("defaults unstored format metadata and orders newer formats", () => {
    expect(FormatVersionSchema.parse(undefined)).toBe(1);
    expect(FormatVersionSchema.parse(2)).toBeGreaterThan(1);
    expect(FormatVersionSchema.safeParse(0).success).toBe(false);
    expect(FormatVersionSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("logical store placement", () => {
  it.each([
    { kind: "active" }, { kind: "backlog", commitment: "planned" },
    { kind: "backlog", commitment: "provisional" }, { kind: "completed", quarter: "2026-q4" },
  ])("accepts a caller placement without physical layout: %j", (value) => {
    expect(WritePlacementSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    { kind: "backlog", commitment: "unknown" }, { kind: "completed", quarter: "2026-Q4" },
    { kind: "backlog", commitment: "planned", cohort: ["group"] },
    { kind: "completed", quarter: "2026-q4", sequence: "01" },
  ])("rejects physical or invalid write placement: %j", (value) => {
    expect(WritePlacementSchema.safeParse(value).success).toBe(false);
  });
  it("requires a work-unit archive sequence only on reads", () => {
    expect(WorkUnitReadPlacementSchema.safeParse({ kind: "completed", quarter: "2026-q4" }).success).toBe(false);
    expect(WorkUnitReadPlacementSchema.safeParse({ kind: "completed", quarter: "2026-q4", sequence: "01" }).success).toBe(true);
  });
  it("keeps Errands out of backlog and numbered archives", () => {
    expect(ErrandReadPlacementSchema.safeParse({ kind: "backlog", commitment: "planned" }).success).toBe(false);
    expect(ErrandReadPlacementSchema.safeParse({ kind: "completed", quarter: "2026-q4", sequence: "01" }).success).toBe(false);
    expect(ErrandReadPlacementSchema.safeParse({ kind: "completed", quarter: "2026-q4" }).success).toBe(true);
  });
});
