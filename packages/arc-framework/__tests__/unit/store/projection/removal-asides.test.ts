/** Recovery-file observation must not turn unavailable filesystem authority into a passing verdict. */
import { describe, expect, it } from "vitest";
import { checkUnrecordedProjectionCopies } from "../../../../src/lib/store/projection/removal-asides.js";
import { ProjectionIndexSchema } from "../../../../src/lib/store/projection/index-schema.js";

describe("unrecorded recovery-file observation", () => {
  it("propagates a failed ancestor observation before it can certify removal", async () => {
    const index = ProjectionIndexSchema.parse({
      format: 2, state: null, entries: {}, withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null,
      projectedUnder: { view: { mode: "mine", pins: [] }, identity: "test-user", claim: null, layoutActive: "nested" },
    });
    const failure = Object.assign(new Error("Recovery folder authority is unavailable."), { code: "EACCES" });
    await expect(checkUnrecordedProjectionCopies({ checkout: "/checkout", index, format: "sha1",
      linkFs: { lstat: () => Promise.reject(failure) },
    })).rejects.toBe(failure);
  });
});
