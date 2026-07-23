import { describe, expect, it } from "vitest";

import { createLocalReviewMethodFilePort } from "../../../../../../src/scripts/review-gate/hosts/local/method-files.js";
import { composeWorkUnitReviewAssurance } from "../../../../../../src/scripts/review-gate/policy/assurance.js";

const method = (name: string, active: boolean): string => [
  "---",
  `name: ${name}`,
  "description: Review method",
  `active: ${String(active)}`,
  "override-active: false",
  "---",
  "",
].join("\n");

describe("local review method files", () => {
  it("reads the registered review methods from the project ARC root", () => {
    const contents = new Map([
      ["/repo/.arc/system/methods/self-review.md", method("self-review", false)],
      ["/repo/.arc/system/methods/frontline-review.md", method("frontline-review", true)],
    ]);
    const readFile = (path: string): string => {
      const content = contents.get(path);
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    };

    const result = composeWorkUnitReviewAssurance(
      { Class: "Heavy", "Review Rubric": "[none]" },
      createLocalReviewMethodFilePort({ cwd: "/repo", readFile }),
      { resolveReviewRubricBinding: () => null },
    );

    expect(result.assurance.activity).toEqual({ selfReview: false, frontlineReview: true });
  });
});
