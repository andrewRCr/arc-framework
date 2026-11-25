/** Hand edits preserve verb-owned metadata, including lifecycle record creation/removal. */
import { describe, expect, it } from "vitest";
import { checkMetaVerbOwnedField } from "../../../../../../src/lib/store/kinds/meta/authority-rules.js";
import { META_RULE_CONTENT as content, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
const changes = [
  content.replace("`Active`", "`Integrating`"),
  content.replace("`Light`", "`Heavy`"),
  content.replace("`process-task-loop`", "`prepare-work-unit`"),
];
describe("meta authority rule", () => {
  it.each(changes)("refuses a changed verb-owned field", (next) => {
    expect(checkMetaVerbOwnedField(metaRuleInput(next))).toMatchObject([{ rule: "meta.verb-owned-field" }]);
  });
  it.each(["create", "remove"])("refuses a hand %s", (operation) => {
    expect(checkMetaVerbOwnedField(metaRuleInput(operation === "remove" ? null : content,
      operation === "create" ? null : content))).toMatchObject([{ rule: "meta.verb-owned-field" }]);
  });
  it("admits an edit of unowned prose", () => {
    expect(checkMetaVerbOwnedField(metaRuleInput(`${content}\n## Notes\n\nAuthored prose.\n`))).toEqual([]);
  });
  it.each(changes)("admits a verb changing its owned fields", (next) => {
    expect(checkMetaVerbOwnedField(metaRuleInput(next, content, { kind: "verb", verb: "transition" }))).toEqual([]);
  });
  it("admits field repairs when the stored prior does not parse", () => {
    expect(checkMetaVerbOwnedField(metaRuleInput(changes[0], "# Broken\n"))).toEqual([]);
  });
});

const pauseBody = "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n\n";
const paused = content.replace("---\n", `${pauseBody}---\n`);
it("refuses hand Owner changes with the handover remedy and admits the verb", () => {
  const next = content.replace("`andrew`", "`other-person`");
  expect(checkMetaVerbOwnedField(metaRuleInput(next))).toMatchObject([{ rule: "meta.verb-owned-field",
    remedy: { text: expect.stringContaining("arc handover") } }]);
  expect(checkMetaVerbOwnedField(metaRuleInput(next, content, { kind: "verb", verb: "handover" }))).toEqual([]);
});
it.each([[content, paused], [paused, paused.replace("Waiting.", "Updated.")], [paused, content]])(
  "refuses hand pause addition, change, and removal", (prior, next) => {
    const result = checkMetaVerbOwnedField(metaRuleInput(next, prior));
    expect(result).toMatchObject([{ rule: "meta.verb-owned-field" }]);
    expect(result[0]?.remedy.text).toContain("arc pause");
    expect(result[0]?.remedy.text).toContain("arc resume");
  });
it("refuses a hand scalar repair combined with an Owner change", () => {
  const prior = paused.replace("2026-10-13T12:00:00Z", "invalid");
  const next = paused.replace("`andrew`", "`other-person`");
  expect(checkMetaVerbOwnedField(metaRuleInput(next, prior))).toMatchObject([{ rule: "meta.verb-owned-field" }]);
});
it("refuses a duplicate-section repair combined with a State change despite unreadable prior fields", () => {
  const prior = paused.replace("---\n", `${pauseBody}---\n`);
  const next = paused.replace("`Active`", "`Integrating`");
  expect(checkMetaVerbOwnedField(metaRuleInput(next, prior))).toMatchObject([{ rule: "meta.verb-owned-field" }]);
});
