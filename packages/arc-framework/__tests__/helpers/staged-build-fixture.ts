/** Compiler-free completed staging for publication policy tests. */
import { join } from "node:path";
import type { BuildArtifactLease } from "../../src/lib/build-ownership.js";
import type { StagedBuildGeneration, BuildMode } from "../../src/lib/build-entry.js";
import { captureBuildBaseline, certifyBuildGeneration } from "../../src/lib/build-baseline.js";
import { projectKernelSchemas, serializeKernelSchemaBundle } from "../../src/lib/kernel/schema/generate.js";
import { makeBuildFixture, writeBuildFixtureFile } from "./build-fixture.js";

/**
 * Hand-build valid staging and evidence from real fixture inputs without starting a producer.
 * @param mode - Requested declaration contract
 * @param confirmOwnership - Ownership boundary, replaceable with a refusal
 * @returns Disposable root, staged generation, evidence, and fake artifact capability
 */
export function makeStagedBuildFixture(
  mode: BuildMode = "fast", confirmOwnership: () => Promise<void> = async () => {},
) {
  const { root, packageRoot } = makeBuildFixture();
  const sources = { cli: "src/cli.ts", schema: "src/scripts/build-schema.ts", controls: "src/control.ts" };
  writeBuildFixtureFile(join(packageRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext" },
    include: ["src/**/*.ts"],
  }));
  for (const file of Object.values(sources)) writeBuildFixtureFile(join(packageRoot, file), "export const marker = 1;\n");
  const before = captureBuildBaseline(packageRoot);
  const directory = join(packageRoot, ".arc-dev-build-fixture");
  const graphs = {
    cli: [`packages/cli/${sources.cli}`], schema: [`packages/cli/${sources.schema}`],
    controls: [`packages/cli/${sources.controls}`],
  };
  writeBuildFixtureFile(join(directory, "cli.js"), 'export const marker = "new-staged-runtime";\n');
  writeBuildFixtureFile(join(directory, "schemas/kernel.json"), serializeKernelSchemaBundle(projectKernelSchemas()));
  writeBuildFixtureFile(join(directory, "metafile-esm.json"), JSON.stringify({
    inputs: { [sources.cli]: { bytes: 25, imports: [] } },
    outputs: { "cli.js": { bytes: 50, inputs: { [sources.cli]: { bytesInOutput: 25 } },
      imports: [], exports: ["marker"], entryPoint: sources.cli } },
  }));
  if (mode === "full") writeBuildFixtureFile(join(directory, "cli.d.ts"), "export declare const marker = 1;\n");
  writeBuildFixtureFile(join(packageRoot, "dist/cli.js"), 'export const marker = "previous-live-runtime";\n');
  const staged: StagedBuildGeneration = { directory, mode, before, graphs };
  const lease: BuildArtifactLease = { packageRoot, confirmOwnership };
  const evidence = certifyBuildGeneration(before, captureBuildBaseline(packageRoot), graphs, mode === "full");
  return { root, packageRoot, staged, lease, evidence };
}
