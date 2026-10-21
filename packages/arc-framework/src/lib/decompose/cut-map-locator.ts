/** Scalar-Unicode admission for record-bound locators over the shared locator grammar. */
import { V3DecomposeLocatorSchema } from "../work-unit/decompose-content.js";
import { isWellFormedUnicode } from "../kernel/canonical/unicode.js";

/** Keep every locator string inside the canonical storage and hashing domain. */
export const CutLocatorSchema = V3DecomposeLocatorSchema.superRefine((locator, ctx) => {
  const strings: { value: string; path: (string | number)[] }[] = [{ value: locator.artifact, path: ["artifact"] }];
  if (locator.kind === "section") {
    strings.push({ value: locator.headingSource, path: ["headingSource"] },
      ...locator.ancestry.map((ancestor, index) => ({ value: ancestor.headingSource, path: ["ancestry", index, "headingSource"] })));
  }
  for (const { value, path } of strings) {
    if (!isWellFormedUnicode(value)) ctx.addIssue({ code: "custom", message: "must contain only well-formed Unicode", path });
  }
});
