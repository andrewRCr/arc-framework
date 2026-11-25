/** Self-hosting refresh composes the real nonrecursive owned build boundary. */
import { readFile, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkDevBuildStaleness, createDevCheckDeps, refreshDevBuildAfterAction } from "../../src/lib/dev-check.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

it("refreshes beside live output and proves the resulting runtime identity", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const cli = join(packageRoot, "dist/cli.js");
  try {
    await writeFile(join(packageRoot, "src/fixture-build-hook.ts"), `
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function runBuildHook(outDir: string, packageRoot: string): Promise<void> {
  void outDir;
  const prior = await readFile(join(packageRoot, "dist/cli.js"), "utf8");
  if (!prior.includes("previous-live-runtime")) throw new Error("previous CLI disappeared during compilation");
}
`);
    await expect(refreshDevBuildAfterAction(cli)).resolves.toEqual({ kind: "refreshed" });
    expect(await readFile(cli, "utf8")).toContain("new-native-runtime");
    expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
    expect((await readdir(packageRoot)).filter((file) => file.startsWith(".arc-dev-build-"))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("retains the prior entry after failed compilation and supports repaired refresh", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const cli = join(packageRoot, "dist/cli.js");
  try {
    const source = join(packageRoot, "src/cli.ts");
    await writeFile(source, "export const marker = ;");
    await expect(refreshDevBuildAfterAction(cli)).resolves.toMatchObject({ kind: "failed", command: "npm run build:fast" });
    expect(await readFile(cli, "utf8")).toContain("previous-live-runtime");
    await writeFile(source, 'export const marker = "repaired-runtime";');
    await expect(refreshDevBuildAfterAction(cli)).resolves.toEqual({ kind: "refreshed" });
    expect(await readFile(cli, "utf8")).toContain("repaired-runtime");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
