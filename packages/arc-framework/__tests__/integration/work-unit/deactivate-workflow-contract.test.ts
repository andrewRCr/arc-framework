import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runTeardownForOperand } from "../../../src/handlers/teardown-operand.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { createRetirementHarness } from "../../helpers/store/retirement-harness.js";

const workflow = readFileSync(
  new URL("../../../arc/system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md", import.meta.url),
  "utf8",
);

it.each(["Abandon with history loss", "Move the work to a successor"])(
  "withdraws an Integrating source through reopen before abandonment for '%s'",
  (choice) => {
    const caseB = workflow.slice(workflow.indexOf("## Case B —"), workflow.indexOf("## Case C —"));
    const choices = caseB.split(/\n(?=- \*\*)/u);
    const selected = choices.find((block) => block.startsWith(`- **${choice}`));
    expect(selected).toBeDefined();

    const sharedIntro = choices[0];
    const sharedEnding = caseB.slice(caseB.indexOf("\n\n", caseB.lastIndexOf("\n- **")));
    const abandonSteps = workflow.slice(workflow.indexOf("## Steps (Case A-delete"), workflow.indexOf("## Case B —"));
    expect(selected?.replace(/\s+/gu, " ")).toMatch(/\bA-delete\b/u);
    const route = [sharedIntro, selected?.split("\n\n")[0], sharedEnding, abandonSteps].join("\n");
    const firstAction = route.match(/\barc\s+reopen\b|\breopen-work-unit\b|\bgh pr close\b|\barc abandon\b/u)?.[0];

    expect(firstAction, "First PR or retirement action for the Integrating source").toMatch(/reopen/u);
  },
);

it("requires the retired UID to finish cleanup once a live work unit reuses its name", async () => {
  const h = await createRetirementHarness({ end: "abandon" });
  const retired = boundWorkUnitSubject(h.meta);
  await h.seedMeta(retired.name);
  const retry = (name: string) => runTeardownForOperand(h.ctx, { name, base: "main" });

  expect(await retry(retired.name)).toMatchObject({ status: "rejected", reason: expect.stringContaining("has not ended") });
  expect(h.refs.has("refs/heads/feat/demo")).toBe(true);
  expect(await retry(retired.uid)).toMatchObject({ status: "torn-down", branchDeleted: true });
  expect(h.refs.has("refs/heads/feat/demo")).toBe(false);
});

it("uses the printed UID-bound teardown command after abandonment", () => {
  const abandon = workflow.slice(workflow.indexOf("### 2) Run the `abandon` transition"), workflow.indexOf("## Case B —"));
  expect(abandon).toMatch(/\barc teardown [^\x60]*\bUID\b/u);
  expect(abandon).toMatch(/\b(?:exact|as)\b[^.]*\bprinted\b/u);
  expect(abandon).not.toContain("`arc teardown {name}`");
});
