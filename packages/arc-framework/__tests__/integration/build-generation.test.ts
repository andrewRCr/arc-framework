/** Real compiler output stays unpublished until an owning parent promotes it. */
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { generateOwnedBuildStaging } from "../../src/lib/build-entry.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

it("generates fast runtime into staging while retaining the live entry", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "native fast generation" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "fast");
      expect(await readFile(join(staged.directory, "cli.js"), "utf8")).toContain("new-native-runtime");
      expect(staged.directory).not.toBe(join(packageRoot, "dist"));
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
      expect(staged.graphs.controls).toContain("packages/arc-framework/tsup.fast.config.ts");
      expect(staged.graphs.controls).toContain("packages/arc-framework/tsup.config.ts");
      expect(staged.graphs.controls).toContain("packages/arc-framework/src/lib/build-generation.ts");
      expect(staged.graphs.controls).toContain("packages/arc-framework/src/lib/build-entry.ts");
      expect(staged.graphs.controls).toContain("packages/arc-framework/src/scripts/build-compiler.ts");
      expect(await readFile(join(packageRoot, ".config-loads"), "utf8")).toBe("loaded\n");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("completes full declarations before returning the unpublished generation", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "native full generation" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "full");
      expect(await readFile(join(staged.directory, "cli.d.ts"), "utf8")).toContain("marker");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it("refuses a failed full declaration build and retains the prior live runtime", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  await writeFile(join(packageRoot, "src/cli.ts"), 'export const marker: number = "invalid declaration";');
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "invalid full generation" }, async (lease) => {
      let outcome = "completed";
      try { await generateOwnedBuildStaging(lease, "full"); }
      catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("rerun npm run build");
        let cause: unknown = error;
        const diagnostics: string[] = [];
        while (cause instanceof Error) { diagnostics.push(cause.message); cause = cause.cause; }
        expect(diagnostics.join("\n")).toMatch(/TS2322|not assignable/iu);
        outcome = "refused";
      }
      expect(outcome).toBe("refused");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
      expect((await readdir(packageRoot)).filter((name) => name.startsWith(".arc-dev-build-"))).toEqual([]);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);
