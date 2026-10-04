/** Native compiler fixtures for first-party input capture. */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { hashSourceInputs, selectBundleInputs } from "../../src/lib/dev-check.js";
import { compileCapturedBuild, loadBuildConfiguration, loadSchemaProducer } from "../../src/lib/build-producers.js";
import { readFile } from "node:fs/promises";
import { PRODUCTION_SCHEMA_IDS } from "../helpers/schema-artifact.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("native compiler input capture", () => {
  it("keeps actual schema producer sources outside shared config dependencies", async () => {
    const packageRoot = resolve(import.meta.dirname, "../..");
    const config = await loadBuildConfiguration(join(packageRoot, "tsup.config.ts"), packageRoot);
    expect(config.dependencies).not.toContain(join(packageRoot, "src/production-schema-registry.ts"));
    const fast = await loadBuildConfiguration(join(packageRoot, "tsup.fast.config.ts"), packageRoot);
    expect(fast.dependencies).toContain(join(packageRoot, "tsup.config.ts"));
    expect(fast.dependencies).not.toContain(join(packageRoot, "src/production-schema-registry.ts"));
    const schema = await loadSchemaProducer(packageRoot);
    expect(schema.dependencies).toContain(join(packageRoot, "src/production-schema-registry.ts"));
    expect(schema.dependencies).toContain(join(packageRoot, "src/lib/kernel/schema/generate.ts"));
    const outDir = await mkdtemp(join(tmpdir(), "arc-schema-producer-"));
    roots.push(outDir);
    await schema.generate(outDir);
    const artifact = JSON.parse(await readFile(join(outDir, "schemas/kernel.json"), "utf8")) as {
      schemas: Record<string, unknown>;
    };
    expect(Object.keys(artifact.schemas)).toEqual(PRODUCTION_SCHEMA_IDS);
  });

  it("executes the captured native configuration without loading it again", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-native-config-"));
    roots.push(root);
    const packageRoot = join(root, "packages/cli");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    const entry = join(packageRoot, "src/entry.ts");
    const output = join(packageRoot, "dist");
    await writeFile(entry, 'export const marker = "captured-options";');
    await writeFile(join(packageRoot, "control.json"), '{"minify":false}');
    const config = join(packageRoot, "tsup.config.ts");
    await writeFile(config, `import controls from "./control.json";\nexport default {
      entry: [${JSON.stringify(entry)}], outDir: ${JSON.stringify(output)},
      format: ["esm"], dts: false, silent: true, ...controls,
    };`);
    const captured = await loadBuildConfiguration(config, packageRoot);
    expect(captured.dependencies).toContain(config);
    expect(captured.dependencies).toContain(join(packageRoot, "control.json"));
    await writeFile(config, 'throw new Error("configuration loaded twice");');
    await compileCapturedBuild(captured.options);
    expect(await readFile(join(output, "entry.js"), "utf8")).toContain("captured-options");
  });

  it("refreshes a runtime-resolved JavaScript sibling and hashes its later contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-native-inputs-"));
    roots.push(root);
    const packageRoot = join(root, "packages/cli");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(join(packageRoot, "src/entry.ts"), 'export { marker } from "./dep.js";');
    await writeFile(join(packageRoot, "src/dep.ts"), 'export const marker = "typescript";');
    const compile = async () => build({
      absWorkingDir: packageRoot, entryPoints: ["src/entry.ts"], bundle: true,
      write: false, metafile: true, platform: "node", format: "esm",
    });
    const original = await compile();
    expect(selectBundleInputs(original.metafile, packageRoot)).toContain(join(packageRoot, "src/dep.ts"));
    await writeFile(join(packageRoot, "src/dep.js"), 'export const marker = "javascript";');
    const replaced = await compile();
    expect(replaced.outputFiles[0]?.text).toContain("javascript");
    const inputs = selectBundleInputs(replaced.metafile, packageRoot);
    expect(inputs).toContain(join(packageRoot, "src/dep.js"));
    expect(inputs).not.toContain(join(packageRoot, "src/dep.ts"));
    const digest = hashSourceInputs(inputs ?? [], root);
    await writeFile(join(packageRoot, "src/dep.js"), 'export const marker = "edited";');
    expect(hashSourceInputs(inputs ?? [], root)).not.toBe(digest);
  });
});
