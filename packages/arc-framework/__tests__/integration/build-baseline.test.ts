/** Native compiler intervals retain baseline content and reject mixed generations. */
import { rmSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, expect, it } from "vitest";
import { build } from "esbuild";
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

const graphs = { cli: ["packages/cli/src/entry.ts"],
  controls: ["packages/cli/package.json"] };

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
