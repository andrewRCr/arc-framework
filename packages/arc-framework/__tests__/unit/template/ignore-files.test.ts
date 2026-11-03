/** Distinct native file identities remain distinct when they exceed JavaScript's exact-number range. */
import { join } from "node:path";
import { expect, it, vi } from "vitest";
const { pathStat } = vi.hoisted(() => ({ pathStat: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({
  ...await original<typeof import("node:fs/promises")>(), lstat: pathStat,
}));
import { writeArcIgnoreBlocks } from "../../../src/lib/template/files.js";

it("writes independent ignore outputs with adjacent 64-bit native file identities", async () => {
  const root = join("/", "repo");
  const files = new Map([
    [join(root, ".gitignore"), 9_007_199_254_740_992n],
    [join(root, ".ignore"), 9_007_199_254_740_993n],
    [join(root, ".arc/user/.npmignore"), 9_007_199_254_740_995n],
  ]);
  pathStat.mockImplementation(async (path: string, options?: { bigint?: boolean }) => {
    const id = files.get(path) ?? 0n;
    return { isSymbolicLink: () => false, isFile: () => files.has(path),
      dev: options?.bigint ? 1n : 1, nlink: options?.bigint ? 1n : 1,
      ino: options?.bigint ? id : Number(id) };
  });
  const written = new Map<string, string>();
  await writeArcIgnoreBlocks(root, [], async () => "*\n", async (path, contents) => { written.set(path, contents); });
  expect(written.get(join(root, ".gitignore"))).toContain(".arc/user/*/");
  expect(written.get(join(root, ".ignore"))).toContain("!.arc/user/*/");
  expect(written.has(join(root, ".arc/user/.npmignore"))).toBe(false);
});
