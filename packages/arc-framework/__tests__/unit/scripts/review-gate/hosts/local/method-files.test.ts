import { describe, expect, it } from "vitest";
import { join } from "node:path";

import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../../../../../../src/scripts/review-gate/hosts/local/method-files.js";
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
  it.each(["/repo", "/repo/cafe\u0301"])("reads the registered review methods from %s", (cwd) => {
    const contents = new Map([
      [join(cwd, ".arc", "system", "methods", "self-review.md"), method("self-review", false)],
      [join(cwd, ".arc", "system", "methods", "frontline-review.md"), method("frontline-review", true)],
    ]);
    const readFile = (path: string): string => {
      const content = contents.get(path);
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    };

    const result = composeWorkUnitReviewAssurance(
      { workClass: "Heavy", reviewRubric: null },
      createLocalReviewMethodFilePort({ cwd, readFile }),
      { resolveReviewRubricBinding: () => { throw new Error("must not resolve absence"); } },
    );

    expect(result.assurance.activity).toEqual({ selfReview: false, frontlineReview: true });
  });

  it.each(["/repo", "/repo/cafe\u0301"])("resolves an exact rubric identity from %s", (cwd) => {
    const content = [
      "---",
      "name: security-audit",
      "description: Security-focused review",
      "override-active: false",
      "review-augmentation:",
      "  rubricId: security-audit/v1",
      "  dimensions:",
      "    - id: authorization",
      "      title: Authorization",
      "      instruction: Verify explicit authority.",
      "---",
      "",
    ].join("\n");
    const directory = join(cwd, ".arc", "system", "methods");
    const port = createLocalReviewRubricBindingPort({
      cwd,
      readDirectory: (path) => path === directory ? ["security-audit.md"] : [],
      readFile: (path) => {
        if (path !== join(directory, "security-audit.md")) throw new Error(`missing ${path}`);
        return content;
      },
    });

    expect(port.resolveReviewRubricBinding("security-audit")).toMatchObject({
      status: "resolved",
      binding: {
        identity: "security-audit",
        augmentation: { rubricId: "security-audit/v1" },
      },
    });
  });
});
