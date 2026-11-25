/** Byte-preserving replacement of marked and provisional delivery-plan regions. */
import { describe, expect, it } from "vitest";
import {
  spliceDeliveryPlanSection, DELIVERY_PLAN_START_SENTINEL as start, DELIVERY_PLAN_END_SENTINEL as end,
} from "../../../../../../src/lib/store/kinds/task-list/index.js";

const section = `${start}\n## Delivery Plan\n\nFresh projection\n${end}\n\n`;

describe("task-list delivery-plan splice", () => {
  it("replaces a marked region, preserving surrounding bytes and consuming only following blank lines", () => {
    const prefix = "# Tasks 🧭\r\n\r\n- [ ] 1.1 Older grammar\r\n\r\n";
    const suffix = "## Success Criteria\r\n\r\n- [ ] Keep this";
    const content = `${prefix}${start}\r\n## Delivery Plan\r\n\r\nOld projection\r\n${end}\r\n\t\r\n\r\n${suffix}`;
    expect(spliceDeliveryPlanSection(content, section)).toEqual({ status: "rendered", content: prefix + section + suffix });
  });

  it.each(["## Success Criteria", "## **Phase 1:** Work"])("replaces an unmarked section up to %s", (heading) => {
    const prefix = "# Tasks\n\n";
    const suffix = `${heading}\n\n- [ ] Keep this\n`;
    const content = `${prefix}## Delivery Plan\n\n### Members\n\nOld projection\n\n${suffix}`;
    expect(spliceDeliveryPlanSection(content, section)).toEqual({ status: "rendered", content: prefix + section + suffix });
  });

  it.each([
    ["missing", "# Tasks\n", "replacement-locus-missing"],
    ["duplicate", "# Tasks\n\n## Delivery Plan\n\nOne\n\n## Delivery Plan\n\nTwo\n", "replacement-locus-duplicate"],
    ["start-only", `${start}\n## Delivery Plan\n`, "replacement-locus-malformed"],
    ["end-only", `${end}\n`, "replacement-locus-malformed"],
    ["scanner-refused unmarked", "- [ ] 1.1 Older task\n\n## Delivery Plan\n", "replacement-locus-malformed"],
  ])("refuses a %s region", (_name, content, reason) => {
    expect(spliceDeliveryPlanSection(content, section)).toEqual({ status: "refused", reason });
  });
});
