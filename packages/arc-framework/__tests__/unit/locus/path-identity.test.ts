/** Lexical checkout identity and record-ID coverage. */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  deriveLocusRecordId,
  normalizeCheckoutPath,
} from "../../../src/lib/locus/path-identity.js";

describe("checkout path identity", () => {
  it("normalizes POSIX paths lexically while preserving case", () => {
    expect(normalizeCheckoutPath("/Repo/child/../worktree/", "posix")).toBe("/Repo/worktree");
    expect(normalizeCheckoutPath("/", "posix")).toBe("/");
  });

  it("normalizes drive, UNC, and extended Windows spellings", () => {
    expect(normalizeCheckoutPath("C:\\Repo\\child\\..\\worktree\\", "windows"))
      .toBe("C:/Repo/worktree");
    expect(normalizeCheckoutPath("\\\\server\\share\\repo\\", "windows"))
      .toBe("//server/share/repo");
    expect(normalizeCheckoutPath("\\\\?\\C:\\Repo\\worktree", "windows"))
      .toBe("//?/C:/Repo/worktree");
  });

  it("rejects relative and mixed-flavor paths", () => {
    expect(() => normalizeCheckoutPath("repo/worktree", "posix")).toThrow(/absolute/u);
    expect(() => normalizeCheckoutPath("C:\\repo", "posix")).toThrow(/POSIX/u);
    expect(() => normalizeCheckoutPath("/repo", "windows")).toThrow(/Windows/u);
  });

  it("hashes the normalized UTF-8 spelling as lowercase SHA-256", () => {
    const normalized = "/Repo/🚀";
    const expected = createHash("sha256").update(Buffer.from(normalized, "utf8")).digest("hex");
    expect(deriveLocusRecordId(normalized, "posix")).toEqual({
      normalizedPath: normalized,
      digest: expected,
      recordId: `sha256:${expected}`,
    });
  });
});
