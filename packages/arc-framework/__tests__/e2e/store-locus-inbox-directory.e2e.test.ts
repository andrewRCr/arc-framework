import type { PathLike, StatOptions } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { repository, stateDirectory } from "../helpers/store-locus-inbox-fixture.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  // Before Node 24.15, fsPromises.stat read only the bigint option.
  return { ...fs, stat: vi.fn((path: PathLike, options?: StatOptions) => fs.stat(path, { bigint: options?.bigint })) };
});

it("uses the common Git directory when origin holds state on early Node 24 releases", async () => {
  const root = await repository(true);
  await expect(stateDirectory(root)).resolves.toBe(join(root, ".git"));
});

it("propagates a stat failure other than a missing directory", async () => {
  const root = await repository(true);
  const failure = Object.assign(new Error("Cannot stat the separate state directory"), { code: "EACCES" });
  vi.mocked(stat).mockRejectedValueOnce(failure);
  await expect(stateDirectory(root)).rejects.toBe(failure);
});
