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
