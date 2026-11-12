/** Metadata shape rules admit valid counterparts and unrelated edits of legacy values. */
import { describe, expect, it } from "vitest";
import { checkMetaFieldBlock, checkMetaDurableFields } from "../../../../../../src/lib/store/kinds/meta/shape-rules.js";
import { META_RULE_CONTENT as content, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
const missingDesign = content.replace(/^- \*\*Design:\*\*.*\n/mu, "");
const invalidState = content.replace("`Active`", "`Drifting`");
const duplicate = (name: string) => content.replace("\n---", `\n- **${name}:** [none]\n- **${name}:** [none]\n\n---`);
describe("meta field block rule", () => {
  it.each([
    content.replace("\n---", ""), missingDesign,
    content.replace("`Active`", "[none]"), invalidState,
    duplicate("State"), duplicate("Design"), duplicate("Cohort"),
  ])("refuses a newly broken field block", (next) => {
    expect(checkMetaFieldBlock(metaRuleInput(next))).toMatchObject([{ rule: "meta.field-block" }]);
  });
  it("admits a valid new field block", () => {
    expect(checkMetaFieldBlock(metaRuleInput(content, null))).toEqual([]);
  });
  it("judges shape whole when the stored prior does not parse", () => {
    expect(checkMetaFieldBlock(metaRuleInput(invalidState, "# Broken\n"))).toMatchObject([{ rule: "meta.field-block" }]);
  });
  it.each([invalidState, duplicate("Design"), content.replace("\n---", "")])(
    "admits an unrelated write preserving an existing defect", (prior) => {
      expect(checkMetaFieldBlock(metaRuleInput(`${prior}\n## Notes\n\nProse.\n`, prior))).toEqual([]);
    },
  );
  it("ignores field-like bullets in narrative sections", () => {
    const next = `${content}\n## Notes\n\n- **State:** bad\n- **State:** bad\n- **Design:** other.md\n`;
    expect(checkMetaFieldBlock(metaRuleInput(next))).toEqual([]);
  });
});


describe("meta durable field rule", () => {
  const invalidValues = [
    content.replace("andrew", "[none]"),
    content.replace("andrew", "andrew@example.com"),
    content.replace("`Light`", "`Unknown`"),
    content.replace("`P1`", "`P9`"),
    content.replace(/^- \*\*Origin:\*\*.*$/mu, "- **Origin:** [none]"),
    content.replace("\n---", "\n- **Promotion Receipt:** not-a-receipt\n\n---"),
    content.replace("\n---", "\n- **Candidate:** not-a-digest\n\n---"),
    content.replace("\n---", "\n- **Session Type:** Mystery\n\n---"),
  ];
  it.each(invalidValues)("refuses a new invalid durable field", (next) => {
    expect(checkMetaDurableFields(metaRuleInput(next))).toMatchObject([{ rule: "meta.durable-fields" }]);
  });
  it("admits a new durable record", () => {
    expect(checkMetaDurableFields(metaRuleInput(content, null))).toEqual([]);
  });
  it.each(invalidValues)("admits an unrelated edit preserving an invalid legacy value", (prior) => {
    expect(checkMetaDurableFields(metaRuleInput(`${prior}\n## Notes\n\nProse.\n`, prior))).toEqual([]);
  });
  it("still judges durable shape whole when the prior has no parsed fields", () => {
    expect(checkMetaDurableFields(metaRuleInput(invalidValues[1], "# Broken\n")))
      .toMatchObject([{ rule: "meta.durable-fields" }]);
  });
  it("leaves changed State validation to the field-block rule", () => {
    expect(checkMetaDurableFields(metaRuleInput(invalidState))).toEqual([]);
  });
  it("admits the durable handoff values and unrestricted prose fields", () => {
    const next = content.replace("\n---", [
      "", "- **Promotion Receipt:** errand-v1/andrew/" + "a".repeat(32),
      "- **Candidate:** sha256:" + "b".repeat(64), "- **Session Type:** `Execution`",
      "- **State at Handoff:** opaque-anchor", "- **Commit at Handoff:** authored-anchor", "", "---",
    ].join("\n")) + "\n## Session Context\n\nAuthored context.\n";
    expect(checkMetaDurableFields(metaRuleInput(next))).toEqual([]);
  });
});
