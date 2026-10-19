/** Shared session repair actions retain executable remedies and checkout scope. */

import { SessionActionsSchema } from "../../../src/lib/session-init/actions.js";
import { describe, expect, it } from "vitest";
import { createSessionEnvelopeRegistry } from "../../../src/lib/session-envelope/registry.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

function registeredAction() {
  const schema = createSessionEnvelopeRegistry().get("session-action");
  expect(schema, "session-action must be discoverable").toBeDefined();
  if (schema === undefined) throw new Error("Missing session-action schema");
  return schema;
}

describe("session repair actions", () => {
  it("accepts a text remedy, executable arguments, and an absolute checkout", () => {
    const schema = registeredAction();
    for (const action of [
      { text: "Choose a branch before continuing." },
      { text: "Inspect", argv: ["arc", "status"] },
      { text: "Inspect here", argv: ["arc", "status"], checkout: "/tmp/project" },
      { text: "Inspect here", checkout: "C:\\work\\project" },
    ]) expect(assertSchemaAccepts(schema, action)).toEqual(action);
    assertSchemaRefuses(schema, { text: "Inspect", checkout: "relative/project" });
  });

  it("refuses an empty collection instead of reporting an unactionable repair", () => {
    const schema = SessionActionsSchema;
    assertSchemaRefuses(schema, []);
    expect(assertSchemaAccepts(schema, [{ text: "Inspect the failure." }]))
      .toEqual([{ text: "Inspect the failure." }]);
  });
});
