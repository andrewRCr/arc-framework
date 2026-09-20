/** Private task-local failed-check log storage behavior. */

import { describe, expect, it } from "vitest";

import { createLocalFailedCheckLogStore } from
  "../../../../../../src/scripts/review-gate/hosts/local/failed-check-logs.js";

const HEAD = "1234567890abcdef1234567890abcdef12345678";

describe("local failed check log store", () => {
  it("materializes logs under a private task-local directory using job identities as filenames", async () => {
    const store = createLocalFailedCheckLogStore({
      temporaryRoot: () => "/safe/tmp",
      makeTemporaryDirectory: async (prefix) => {
        if (prefix !== "/safe/tmp/arc-failed-check-logs-") {
          throw new Error(`unsafe temporary prefix: ${prefix}`);
        }
        return `${prefix}abc123`;
      },
      writePrivateFile: async (path, contents) => {
        if (path !== "/safe/tmp/arc-failed-check-logs-abc123/job-92.log") {
          throw new Error(`unsafe log path: ${path}`);
        }
        if (contents !== "failure output\n") throw new Error("wrong log contents");
      },
    });

    await expect(store.materialize([{
      job: {
        name: "Integration Tests",
        runId: "91",
        jobId: "92",
        headSha: HEAD,
        url: "https://github.com/owner/repo/actions/runs/91/job/92",
      },
      log: "failure output\n",
    }])).resolves.toEqual([{
      name: "Integration Tests",
      runId: "91",
      jobId: "92",
      headSha: HEAD,
      url: "https://github.com/owner/repo/actions/runs/91/job/92",
      path: "/safe/tmp/arc-failed-check-logs-abc123/job-92.log",
    }]);
  });

  it("refuses duplicate job identities before materializing files", async () => {
    const store = createLocalFailedCheckLogStore({
      temporaryRoot: () => "/safe/tmp",
      makeTemporaryDirectory: async () => { throw new Error("duplicates must fail first"); },
      writePrivateFile: async () => { throw new Error("duplicates must not be written"); },
    });
    const entry = {
      job: {
        name: "Integration Tests",
        runId: "91",
        jobId: "92",
        headSha: HEAD,
        url: "https://github.com/owner/repo/actions/runs/91/job/92",
      },
      log: "failure output\n",
    };

    await expect(store.materialize([entry, entry])).rejects.toThrow("duplicate failed-check job identity: 92");
  });
});
