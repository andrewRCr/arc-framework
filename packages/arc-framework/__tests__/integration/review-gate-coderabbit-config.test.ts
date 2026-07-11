import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { validateCodeRabbitRepositoryDelta } from "../../src/scripts/review-gate/providers/coderabbit/config.js";

describe("repository CodeRabbit configuration", () => {
  it("matches the validated minimal inherited delta", async () => {
    const content = await readFile(fileURLToPath(new URL("../../../../.coderabbit.yaml", import.meta.url)), "utf8");
    expect(validateCodeRabbitRepositoryDelta(load(content))).toMatchObject({
      inheritance: true,
      reviews: {
        request_changes_workflow: true,
        commit_status: true,
        fail_commit_status: true,
        auto_review: { enabled: true, labels: ["arc-review-gate"] },
      },
    });
  });
});
