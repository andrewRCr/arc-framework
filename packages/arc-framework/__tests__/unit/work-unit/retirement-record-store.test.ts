import { describe, expect, it, vi } from "vitest";

import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import {
  RETIREMENT_RECORD_NAMESPACE,
  decodeRetirementRecordKey,
  encodeRetirementRecordKey,
  resolveRetirementRecordPath,
  writeRetirementRecord,
  type RetirementRecordFs,
} from "../../../src/lib/work-unit/retirement-record-store.js";

const digest = contentDigest(new TextEncoder().encode("receipt"));
const hex = digest.slice("sha256:".length);

describe("retirement record key codec", () => {
  it("round-trips the canonical digest through its filesystem-safe spelling", () => {
    const key = encodeRetirementRecordKey(digest);

    expect(key).toBe(`sha256-${hex}`);
    expect(decodeRetirementRecordKey(key)).toBe(digest);
  });

  it.each([
    `sha256-${hex.toUpperCase()}`,
    `sha256-${hex.slice(1)}`,
    `sha256:${hex}`,
    hex,
    `sha512-${hex}`,
    `sha256-${hex}/outside`,
  ])("rejects non-canonical record key %s", (key) => {
    expect(() => decodeRetirementRecordKey(key)).toThrow("invalid retirement record key");
  });

  it("rejects a forged digest value before using it as a path key", () => {
    expect(() => encodeRetirementRecordKey("sha256:not-a-digest" as typeof digest)).toThrow(
      "invalid canonical digest",
    );
  });

  it("resolves only beneath the adapter-owned namespace", () => {
    expect(resolveRetirementRecordPath("/repo", digest)).toBe(
      `/repo/${RETIREMENT_RECORD_NAMESPACE}/sha256-${hex}.json`,
    );
  });
});

describe("retirement record namespace", () => {
  it("creates the namespace lazily on the first write and writes no package-source mirror", async () => {
    const fs: RetirementRecordFs = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();

    await writeRetirementRecord("/repo", digest, "record-bytes", fs);

    expect(fs.mkdir).toHaveBeenCalledExactlyOnceWith(
      `/repo/${RETIREMENT_RECORD_NAMESPACE}`,
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalledExactlyOnceWith(
      `/repo/${RETIREMENT_RECORD_NAMESPACE}/sha256-${hex}.json`,
      "record-bytes",
    );
    expect(vi.mocked(fs.writeFile).mock.calls.flat()).not.toContainEqual(
      expect.stringContaining("packages/arc-framework/arc"),
    );
  });
});
