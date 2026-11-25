import type { PathLike, StatOptions } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { repository, stateDirectory } from "../helpers/store-locus-inbox-fixture.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  // Before Node 24.15, fsPromises.stat read only the bigint option.
  return { ...fs, stat: (path: PathLike, options?: StatOptions) => fs.stat(path, { bigint: options?.bigint }) };
});

it("uses the common Git directory when origin holds state on early Node 24 releases", async () => {
  const root = await repository(true);
  await expect(stateDirectory(root)).resolves.toBe(join(root, ".git"));
});

it("propagates a stat failure other than a missing directory", async () => {
  const root = await repository(true);
  await expect(stateDirectory(join(root, ".git", "config"))).rejects.toMatchObject({ code: "ENOTDIR" });
});
