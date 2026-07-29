import { describe, expect, it, vi } from "vitest";

import {
  parseDecomposePreparationRecord,
  prepareDecomposeRetirement,
  prepareV3DecomposeRetirement,
} from "../../../src/lib/work-unit/decompose-preparation.js";
import { resolveRetirementRecordRelativePath } from "../../../src/lib/work-unit/retirement-record-store.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

describe("retired v1/v2 decomposition preparation boundary", () => {
  it("refuses legacy evidence instead of manufacturing v3 authority", async () => {
    expect(parseDecomposePreparationRecord("{}")).toBeNull();
    expect(await prepareDecomposeRetirement(
      {} as never,
      {} as never,
      {} as never,
      "legacy-authority",
    )).toEqual({ status: "refused", reason: "unsupported-transition" });
  });
});

describe("v3 decomposition preparation persistence", () => {
  it("rolls back a newly staged record when post-create authority verification fails", async () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const recordPath = resolveRetirementRecordRelativePath(preparation.receiptId);
    const staged: string[] = [];
    const removeRecord = vi.fn(async () => undefined);
    const rollbackPaths = vi.fn(async (paths: readonly string[]) => {
      for (const path of paths) {
        const index = staged.indexOf(path);
        if (index >= 0) staged.splice(index, 1);
      }
    });
    const readAuthoritySnapshot = vi.fn()
      .mockResolvedValueOnce({ authorityVersion: "initial", recordState: "absent" })
      .mockRejectedValueOnce(new Error("post-create authority read failed"));

    const result = await prepareV3DecomposeRetirement({
      readAuthoritySnapshot,
      readStagedPaths: async () => [],
      readRecord: async () => null,
      createRecord: async () => undefined,
      removeRecord,
      stagePaths: async (paths) => {
        staged.push(...paths);
      },
      rollbackPaths,
    }, preparation, "initial");

    expect(result).toEqual({ status: "refused", reason: "authority-unavailable" });
    expect(rollbackPaths).toHaveBeenCalledExactlyOnceWith([recordPath]);
    expect(removeRecord).toHaveBeenCalledExactlyOnceWith(preparation.receiptId);
    expect(staged).toEqual([]);
  });
});
