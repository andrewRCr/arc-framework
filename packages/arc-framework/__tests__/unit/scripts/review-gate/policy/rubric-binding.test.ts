import { describe, expect, it } from "vitest";

import {
  resolveReviewRubricBinding,
  type ReviewRubricMethodLookupPort,
} from "../../../../../src/scripts/review-gate/policy/rubric-binding.js";

const method = (identity: string, augmentation: readonly string[]): string => [
  "---",
  `name: ${identity}`,
  "description: Project review rubric",
  "override-active: false",
  "review-augmentation:",
  ...augmentation,
  "---",
  "",
  "# prose must not become control data",
].join("\n");

const lookup = (...files: unknown[]): ReviewRubricMethodLookupPort => ({
  lookupMethodFiles: () => files,
});

describe("review rubric binding", () => {
  it("parses and canonicalizes a structured project augmentation", () => {
    const result = resolveReviewRubricBinding("security-audit", lookup(method("security-audit", [
      "  rubricId: security-audit/v1",
      "  dimensions:",
      "    - id: trust-boundaries",
      "      title: Trust boundaries",
      "      instruction: Verify inputs at every trust boundary.",
      "    - id: authorization",
      "      title: Authorization",
      "      instruction: Verify every privileged operation has explicit authority.",
    ])));

    expect(result).toEqual({
      status: "resolved",
      binding: {
        identity: "security-audit",
        augmentation: {
          rubricId: "security-audit/v1",
          dimensions: [
            {
              id: "authorization",
              title: "Authorization",
              instruction: "Verify every privileged operation has explicit authority.",
            },
            {
              id: "trust-boundaries",
              title: "Trust boundaries",
              instruction: "Verify inputs at every trust boundary.",
            },
          ],
        },
      },
      diagnostics: [],
    });
  });

  it("refuses an augmentation whose rubric id does not version the method identity", () => {
    const result = resolveReviewRubricBinding("security-audit", lookup(method("security-audit", [
      "  rubricId: privacy-audit/v1",
      "  dimensions:",
      "    - id: authorization",
      "      title: Authorization",
      "      instruction: Verify explicit authority.",
    ])));

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "identity-mismatch",
      diagnostics: ["rubric.security-audit.identity-mismatch"],
    });
  });

  it("refuses duplicate project dimensions after canonical ordering", () => {
    const result = resolveReviewRubricBinding("security-audit", lookup(method("security-audit", [
      "  rubricId: security-audit/v1",
      "  dimensions:",
      "    - id: authorization",
      "      title: Authorization",
      "      instruction: Verify explicit authority.",
      "    - id: authorization",
      "      title: Authorization again",
      "      instruction: Verify explicit authority again.",
    ])));

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "malformed-augmentation",
    });
  });

  it("never derives augmentation control data from method prose", () => {
    const content = [
      "---",
      "name: security-audit",
      "description: Project review rubric",
      "override-active: false",
      "---",
      "",
      "review-augmentation:",
      "  rubricId: security-audit/v1",
    ].join("\n");

    expect(resolveReviewRubricBinding("security-audit", lookup(content))).toMatchObject({
      status: "unavailable",
      reason: "missing-augmentation",
    });
  });
});
