/** Production discovery and JSON Schema projection of the compiled agenda. */

import { describe, expect, it } from "vitest";
import { SessionInitAgendaSchema } from "../../../src/commands/agenda/schema.js";
import { projectKernelSchemaClosure } from "../../../src/lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";

describe("agenda schema discovery", () => {
  it("publishes the strict current agenda contract at version one", () => {
    const registry = createProductionSchemaRegistry();
    expect(registry.meta("session-init-agenda")).toEqual({
      id: "session-init-agenda", version: 1, migrationPosture: "strict-current",
    });
    expect(registry.get("session-init-agenda")).toBe(SessionInitAgendaSchema);
  });

  it("serves the described fields and registered residual contracts in a closed schema", () => {
    const document = projectKernelSchemaClosure(createProductionSchemaRegistry(), "session-init-agenda");
    const json = JSON.stringify(document);
    expect(document.$id).toBe("urn:arc:schema:session-init-agenda");
    expect(json).toContain("Execute in order; mutations recompile or hand off.");
    for (const id of ["config-session-init", "release-routing", "domain-rules-session-init", "inbox-state"]) {
      expect(document.$defs?.[id]).toBeDefined();
      expect(json).toContain(`"$ref":"#/$defs/${id}"`);
    }
    expect(json).not.toMatch(/"\$ref":"(?!#)/u);
  });
});
