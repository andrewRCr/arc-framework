/** Generation interval validation against concrete source, configuration, and installation state. */
import { rmSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { relative } from "node:path";
import { identifyBuildInputs, sharedBuildIdentity } from "../../src/lib/build-evidence.js";
import { captureBuildBaseline, certifyBuildGeneration } from "../../src/lib/build-baseline.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const value = makeBuildFixture();
  roots.push(value.root);
  writeBuildFixtureFile(join(value.packageRoot, "tsconfig.json"), '{"include":["src"]}');
  writeBuildFixtureFile(join(value.packageRoot, "src/entry.ts"), "export const marker = 1;");
  return value;
}

const graphs = { cli: ["packages/cli/src/entry.ts"], schema: ["packages/cli/src/entry.ts"],
  controls: ["packages/cli/package.json"] };

describe("generation interval", () => {
  it("rejects observed source changes and certifies a subsequent stable baseline", () => {
    const { packageRoot } = fixture();
    const before = captureBuildBaseline(packageRoot);
    writeBuildFixtureFile(join(packageRoot, "src/entry.ts"), "export const marker = 2;");
    const after = captureBuildBaseline(packageRoot);
    expect(() => certifyBuildGeneration(before, after, graphs, false)).toThrow(/inputs changed.*rerun/iu);
    expect(certifyBuildGeneration(after, captureBuildBaseline(packageRoot), graphs, false).identities.runtime)
      .toMatch(/^[a-f0-9]{64}$/u);
  });

  for (const kind of ["config", "installation", "membership", "manifest", "entry-kind"] as const) {
    it(`rejects observed ${kind} changes and accepts the repaired stable state`, (context) => {
      const { root, packageRoot } = fixture();
      const manifest = join(packageRoot, "src/nested/package.json");
      writeBuildFixtureFile(manifest, '{"sideEffects":true}');
      writeBuildFixtureFile(join(packageRoot, "src/target.ts"), "export const marker = 1;");
      const before = captureBuildBaseline(packageRoot);
      if (kind === "config") {
        writeBuildFixtureFile(join(packageRoot, "tsconfig.json"), '{"compilerOptions":{"strict":true},"include":["src"]}');
      } else if (kind === "installation") {
        const file = join(root, "node_modules/.package-lock.json");
        writeBuildFixtureFile(file, `${readFileSync(file, "utf8")}\n`);
      } else if (kind === "membership") {
        writeBuildFixtureFile(join(packageRoot, "src/new.js"), "export const value = 1;");
      } else if (kind === "manifest") {
        writeBuildFixtureFile(manifest, '{"sideEffects":false}');
      } else {
        rmSync(join(packageRoot, "src/entry.ts"));
        try { symlinkSync("target.ts", join(packageRoot, "src/entry.ts")); }
        catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") context.skip();
          else throw error;
        }
      }
      const after = captureBuildBaseline(packageRoot);
      expect(() => certifyBuildGeneration(before, after, graphs, false)).toThrow(/inputs changed.*rerun/iu);
      expect(certifyBuildGeneration(after, captureBuildBaseline(packageRoot), graphs, false).qualification.published).toBe(true);
    });
  }

  it("requires eventual producer dependencies to exist in the captured baseline", () => {
    const { packageRoot } = fixture();
    const before = captureBuildBaseline(packageRoot);
    expect(() => certifyBuildGeneration(before, before, { ...graphs,
      cli: [...graphs.cli, "packages/cli/src/unseen.ts"],
    }, false)).toThrow(/absent from the baseline.*rerun/iu);
  });

  it("uses baseline digests for late native metadata and rejects a mixed generation", async () => {
    const { root, packageRoot } = fixture();
    const source = join(packageRoot, "src/entry.ts");
    const before = captureBuildBaseline(packageRoot);
    const compiled = await build({
      absWorkingDir: packageRoot, entryPoints: ["src/entry.ts"], bundle: true,
      write: false, metafile: true, format: "esm",
      plugins: [{ name: "source-interval", setup(compiler) {
        compiler.onLoad({ filter: /entry\.ts$/ }, () => {
          const contents = readFileSync(source, "utf8");
          writeBuildFixtureFile(source, "export const marker = 2;");
          return { contents, loader: "ts" };
        });
      } }],
    });
    expect(compiled.outputFiles[0]?.text).toContain("marker = 1");
    const cli = Object.keys(compiled.metafile?.inputs ?? {}).map((key) =>
      relative(root, join(packageRoot, key)).replaceAll("\\", "/"));
    const nativeGraphs = { ...graphs, cli };
    const after = captureBuildBaseline(packageRoot);
    expect(() => certifyBuildGeneration(before, after, nativeGraphs, false)).toThrow(/inputs changed.*rerun/iu);
    const repaired = await build({ absWorkingDir: packageRoot, entryPoints: ["src/entry.ts"],
      bundle: true, write: false, metafile: true, format: "esm" });
    expect(repaired.outputFiles[0]?.text).toContain("marker = 2");
    const evidence = certifyBuildGeneration(after, captureBuildBaseline(packageRoot), nativeGraphs, false);
    expect(evidence.identities).toEqual(identifyBuildInputs({ ...nativeGraphs,
      controls: [...nativeGraphs.controls, ...after.configurationInputs],
    }, after.contents, sharedBuildIdentity(after.context.identity, after.inventory.identity)));
  });
});
