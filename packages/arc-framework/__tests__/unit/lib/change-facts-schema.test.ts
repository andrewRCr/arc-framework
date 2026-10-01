import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  CanonicalChangeSchema,
  ChangePathFactSchema,
  ChangePathSetSchema,
  ChangeSetSchema,
  type CanonicalChange,
} from "../../../src/lib/change-facts.schema.js";
import { z } from "zod";
import { expectTypeOf } from "vitest";

describe("canonical change schemas", () => {
  it.each([
    { status: "added", path: "new", oldMode: "000000", newMode: "100644" },
    { status: "modified", path: "changed", oldMode: "100644", newMode: "100755" },
    { status: "deleted", path: "old", oldMode: "100644", newMode: "000000" },
    {
      status: "renamed",
      path: "new-name",
      previousPath: "old-name",
      oldMode: "100644",
      newMode: "100644",
    },
    {
      status: "copied",
      path: "copy",
      previousPath: "source",
      oldMode: "100644",
      newMode: "100644",
    },
    { status: "type-changed", path: "link", oldMode: "100644", newMode: "120000" },
  ])("accepts canonical $status records", (change) => {
    expect(CanonicalChangeSchema.parse(change)).toEqual(change);
  });

  it("requires a non-empty known set and an empty unknown set", () => {
    const change = { status: "added", path: "new", oldMode: "000000", newMode: "100644" };
    expect(ChangeSetSchema.parse({ changeSet: "known", changes: [change] })).toEqual({
      changeSet: "known",
      changes: [change],
    });
    expect(ChangeSetSchema.parse({ changeSet: "unknown", changes: [] })).toEqual({
      changeSet: "unknown",
      changes: [],
    });
    assertSchemaRefuses(ChangeSetSchema, { changeSet: "known", changes: [] });
    assertSchemaRefuses(ChangeSetSchema, { changeSet: "unknown", changes: [change] });
    assertSchemaRefuses(ChangePathSetSchema, { changeSet: "known", changes: [] });
  });

  it("rejects unknown fields and invalid endpoint or mode combinations", () => {
    assertSchemaRefuses(CanonicalChangeSchema, {
      status: "added",
      path: "new",
      oldMode: "100644",
      newMode: "100644",
    });
    assertSchemaRefuses(CanonicalChangeSchema, {
      status: "renamed",
      path: "new",
      oldMode: "100644",
      newMode: "100644",
    });
    assertSchemaRefuses(CanonicalChangeSchema, {
      status: "modified",
      path: "changed",
      previousPath: undefined,
      oldMode: "100644",
      newMode: "100644",
    });
    assertSchemaRefuses(CanonicalChangeSchema, {
      status: "modified",
      path: "changed",
      oldMode: "100644",
      newMode: "120000",
    });
    assertSchemaRefuses(CanonicalChangeSchema, {
      status: "added",
      path: "new",
      oldMode: "000000",
      newMode: "100644",
      score: 100,
    });
    assertSchemaRefuses(ChangePathFactSchema, {
      status: "copied",
      path: "same",
      previousPath: "same",
    });
  });

  it("exports its structural type from the schema", () => {
    expectTypeOf<CanonicalChange>().toEqualTypeOf<z.infer<typeof CanonicalChangeSchema>>();
  });
});
