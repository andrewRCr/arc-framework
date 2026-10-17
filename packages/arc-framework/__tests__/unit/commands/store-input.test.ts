/** Explicit store command inputs participate in the canonical declaration registry. */

import { expect, it } from "vitest";
import { commandInputRegistrations } from "../../../src/command-input-registrations.js";

it.each([
  ["store conflict", { uid: "11111111-1111-4111-8111-111111111111", kind: "review/conflict-record", id: "clash", discard: true, json: true }, { uid: "slug", kind: "personal/conflict-record", id: "clash" }],
  ["store remote", { remote: "origin", role: "push", ownState: true, json: true }, { remote: "origin", role: "other" }],
  ["store migrate", { to: "origin", trial: true, leaveSource: false, import: false, json: true }, { trial: "yes" }],
] as const)("registers and validates %s", (path, valid, invalid) => {
  const registration = commandInputRegistrations.find(({ commandPath }) => commandPath === path);
  expect(registration).toBeDefined();
  if (!registration) throw new Error("Command input registration is absent");
  expect(registration.schema.safeParse(valid).success).toBe(true);
  expect(registration.schema.safeParse(invalid).success).toBe(false);
});
