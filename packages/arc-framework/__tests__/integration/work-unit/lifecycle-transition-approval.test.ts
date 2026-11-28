import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

const workflows = resolve(import.meta.dirname, "../../../arc/system/workflows/arc/work-unit-lifecycle");

it.each([
  ["activate", /\b(?:activate|activation)\b/iu],
  ["promote", /\b(?:promote|promotion)\b/iu],
] as const)("gates arc %s on approval for that transition before invoking it", (verb, transition) => {
  const workflow = readFileSync(resolve(workflows, `${verb}-work-unit.md`), "utf8");
  const invocation = workflow.indexOf(`\narc ${verb} `);
  expect(invocation, `arc ${verb} command in the workflow`).toBeGreaterThan(-1);

  const gates = workflow.slice(0, invocation).match(/^> `workflow-interlock`[^\n]*(?:\n>[^\n]*)*/gmu) ?? [];
  expect(gates.some(gate => transition.test(gate)), `approval gate for arc ${verb} before the command`).toBe(true);
});
