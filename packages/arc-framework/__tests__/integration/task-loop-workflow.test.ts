import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("offers the next Errand from the queue even when an in-flight origin remains in the inbox", async () => {
  const loop = await readFile(new URL("../../arc/system/workflows/arc/process-task-loop.template.md", import.meta.url), "utf8");
  const completion = loop.split("### Atomic Task Completion")[1]?.split("\n### ")[0] ?? "";
  expect(completion).toMatch(/partial protection[\s\S]+(?:leave|retain|remain)[^.]+inbox[^.]+until close/iu);
  expect(completion).toMatch(/(?:next|offer)[^.]+eligible[^.]+Errand queue/iu);
});

it("bounds ARC state evidence to the task under review and reports gaps for saved tasks", async () => {
  const skill = await readFile(new URL("../../arc/system/.internal/skills/arc-task-review/SKILL.md", import.meta.url), "utf8");
  const evidence = skill.split("2. Gather file change evidence.")[1]?.split("\n3. ")[0] ?? "";
  expect(evidence).toMatch(/arc selection --changed` only (?:if|when)[^.]+(?:save interval|since the last save)[^.]+scope/iu);
  expect(evidence).toMatch(/saved[^.]+(?:captured|recorded)[^.]+(?:during|for)[^.]+task/iu);
  expect(evidence).toMatch(/(?:report|identify)[^.]*(?:gap[^.]*state|state[^.]*(?:gap|cannot (?:be )?verif))/iu);
});
