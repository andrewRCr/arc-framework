/** Full registered session-slot contracts accept producer fixtures and reject undeclared fields. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectUserReferenceSessionResult } from "../../../src/lib/user-reference-reconcile.js";
import { UserReferenceReconcileSessionResultSchema } from "../../../src/lib/user-reference-reconcile-schema.js";
import { SessionInitProbeResultSchema } from "../../../src/commands/status/schema.js";
import { createSessionEnvelopeRegistry } from "../../../src/lib/session-envelope/registry.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(import.meta.dirname, "../../fixtures/session-envelope", name), "utf8")
    .replaceAll(/<DATE_\d+>/gu, "2026-01-02")) as Record<string, unknown>;
}

const slots = [
  ["derivedLocusState", "derived-locus-frame"], ["user", "session-init-user"],
  ["currentWuReconcile", "current-wu-reconcile"], ["userReferenceReconcile", "user-reference-reconcile"],
  ["sweep", "stale-worktree-sweep"], ["errandState", "errand-state"],
  ["workUnitState", "session-work-unit-state"], ["recovery", "session-init-recovery"],
] as const;
const scenarios = ["orient", "active-resume", "current-husk", "branch-gone", "identity-missing"];

describe("registered full session slots", () => {
  it.each(slots)("validates the %s producer payload under %s", (slot, id) => {
    const schema = createSessionEnvelopeRegistry().get(id);
    expect(schema, `${id} must be served by schema discovery`).toBeDefined();
    if (schema === undefined) throw new Error(`Missing ${id}`);
    let exercised = false;
    for (const name of scenarios) {
      const probe = fixture(`session-init-${name}.json`)[slot] as { ok?: boolean; value?: unknown } | undefined;
      if (probe?.ok !== true) continue;
      expect(assertSchemaAccepts(schema, probe.value)).toEqual(probe.value);
      assertSchemaRefuses(schema, { ...(probe.value as object), undeclared: true });
      exercised = true;
    }
    expect(exercised, `No producer scenario exercised ${slot}`).toBe(true);
  });

  it("accepts the producer's quiet result when remote authority is deliberately not required", () => {
    const result = projectUserReferenceSessionResult({
      status: "unavailable", ref: "main", reason: "remote-not-required", remoteEvidence: "not-applicable",
    }, { userInbox: { path: "/tmp/USER-INBOX.md", content: "" } });
    expect(assertSchemaAccepts(UserReferenceReconcileSessionResultSchema, result)).toEqual(result);
  });

  it("rejects an undeclared nested checkout field at the session output boundary", () => {
    const value = fixture("session-init-active-resume.json");
    assertSchemaAccepts(SessionInitProbeResultSchema, value);
    const frame = value.derivedLocusState as { value: { roster: { checkout: object }[] } };
    const first = frame.value.roster[0];
    if (first === undefined) throw new Error("Missing fixture checkout");
    first.checkout = { ...first.checkout, undeclared: true };
    assertSchemaRefuses(SessionInitProbeResultSchema, value);
  });
});
