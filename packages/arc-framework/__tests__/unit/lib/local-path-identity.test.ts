import { describe, expect, it, vi } from "vitest";

import {
  canonicalLocalPath,
  localPathContains,
  localPathsEqual,
  type RealpathFn,
} from "../../../src/lib/local-path-identity.js";

describe("local path identity", () => {
  const aliasRealpath: RealpathFn = vi.fn(async (path) =>
    path.replace(/^\/var(?=\/|$)/u, "/private/var"),
  );

  it("compares existing paths by filesystem identity rather than spelling", async () => {
    await expect(localPathsEqual(
      "/var/folders/project",
      "/private/var/folders/project",
      aliasRealpath,
    )).resolves.toBe(true);
  });

  it("checks containment after resolving aliases on both paths", async () => {
    await expect(localPathContains(
      "/private/var/folders/project",
      "/var/folders/project/packages/arc-framework",
      aliasRealpath,
    )).resolves.toBe(true);
    await expect(localPathContains(
      "/private/var/folders/project",
      "/var/folders/project-sibling",
      aliasRealpath,
    )).resolves.toBe(false);
  });

  it("falls back to lexical identity when a destination does not exist yet", async () => {
    const unavailable: RealpathFn = vi.fn(async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });

    const expected = await canonicalLocalPath("./target", unavailable);
    await expect(canonicalLocalPath("./future/../target", unavailable)).resolves.toBe(expected);
  });

  it("propagates operational realpath failures", async () => {
    const denied: RealpathFn = vi.fn(async () => {
      const error = new Error("denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      throw error;
    });

    await expect(canonicalLocalPath("./target", denied)).rejects.toMatchObject({ code: "EACCES" });
  });
});
