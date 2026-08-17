/** Unit coverage for durable submission-boundary persistence. */

import { describe, expect, it } from "vitest";

import { SlugSchema } from "../../../src/lib/kernel/index.js";
import {
  readSubmissionBoundary,
  writeSubmissionBoundary,
  type SubmissionBoundaryStoreFs,
} from "../../../src/lib/work-unit/submission-boundary-store.js";
import type { IntegrationBoundaryLocus } from
  "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

function memoryFs(): SubmissionBoundaryStoreFs {
  const files = new Map<string, string>();
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content !== undefined) return content;
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    writeFile: async (path, content) => { files.set(path, content); },
  };
}

describe("submission boundary store", () => {
  it("distinguishes absence from a canonical persisted resume point", async () => {
    const fs = memoryFs();
    const candidateId = `sha256:${"a".repeat(64)}`;
    const boundary: IntegrationBoundaryLocus = {
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: SlugSchema.parse("example"),
      candidateId,
      candidateRevision: "b".repeat(40),
      locus: "publication-pending",
      nextAction: {
        kind: "continue-publication",
        command: "git push -u origin feat/example",
        interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
      },
      policy: null,
      reservation: null,
    };

    expect(await readSubmissionBoundary("/repo", "example", fs)).toBeNull();

    const path = await writeSubmissionBoundary("/repo", boundary, fs);

    expect(path).toBe(".arc/system/.internal/candidates/example.boundary.json");
    expect(await readSubmissionBoundary("/repo", "example", fs)).toEqual(boundary);
  });
});
