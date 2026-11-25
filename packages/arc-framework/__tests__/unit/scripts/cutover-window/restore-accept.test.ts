/** Acceptance operands preserve exact ref/value pairs and reject ambiguous or incomplete leases. */
import { expect, it } from "vitest";
import { parseWindowAcceptedValues } from "../../../../src/scripts/cutover-window/restore-accept.js";
import { parseWindowFlipInput } from "../../../../src/scripts/cutover-window/input.js";

const ref = "refs/arc/user/andrew/errands", tip = "a".repeat(40);
it("retains multiple exact values for one ref, including absence, and deduplicates identical pairs", () => {
  expect(parseWindowAcceptedValues([`${ref}=${tip}`, `${ref}=absent`, `${ref}=${tip}`, `refs/arc/tmp/a=b=${"b".repeat(64)}`]))
    .toEqual([{ ref, value: tip }, { ref, value: null }, { ref: "refs/arc/tmp/a=b", value: "b".repeat(64) }]);
});
it.each([ref, `${ref}=`, `${ref}=HEAD`, `${ref}=${"a".repeat(39)}`, `refs/arc-window/record=${tip}`, `refs/arc/a b=${tip}`])(
  "refuses an unusable acceptance operand %s", value => {
    expect(() => parseWindowAcceptedValues([value])).toThrow(expect.objectContaining({ findings: [expect.objectContaining({
      subject: "restore acceptance", remedy: expect.stringContaining("retry"),
    })] }));
  },
);
it("parses repeatable acceptance operands only for restore", () => {
  const args = ["--flip-branch", "feat/flip", "--flip-pr", "7", "--accept", `${ref}=${tip}`, "--accept", `${ref}=absent`];
  expect(parseWindowFlipInput(args, "restore")).toEqual({ branch: "feat/flip", pullRequest: 7, accept: [`${ref}=${tip}`, `${ref}=absent`] });
  expect(() => parseWindowFlipInput(args)).toThrow(expect.objectContaining({ findings: [expect.objectContaining({ subject: "check options" })] }));
});
