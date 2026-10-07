/** Disposable first-party build sources using the real installed compiler and native loaders. */
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createProductionSchemaRegistry } from "../../src/production-schema-registry.js";
import { copyLiveTree } from "./copy-live-tree.js";
import { projectKernelSchemas } from "../../src/lib/kernel/schema/generate.js";

/**
 * Make a native compiler checkout with a tiny CLI and production-shaped schema producer.
 * @returns Fixture root and package boundary for caller-owned cleanup
 */
export async function makeNativeBuildFixture(): Promise<{ root: string; packageRoot: string }> {
  const sourcePackage = resolve(import.meta.dirname, "../..");
  const sourceRoot = resolve(sourcePackage, "../..");
  const root = await mkdtemp(join(tmpdir(), "arc-native-build-"));
  const packageRoot = join(root, "packages/arc-framework");
  await mkdir(packageRoot, { recursive: true });
  await copyLiveTree(join(sourcePackage, "src"), join(packageRoot, "src"));
  for (const file of ["package.json", "package-lock.json"]) {
    await writeFile(join(root, file), await readFile(join(sourceRoot, file)));
  }
  for (const file of ["package.json", "tsup.config.ts", "tsup.fast.config.ts", "build-compiler.config.ts"]) {
    await writeFile(join(packageRoot, file), await readFile(join(sourcePackage, file)));
  }
  const configPath = join(packageRoot, "tsup.config.ts");
  const configuration = await readFile(configPath, "utf8");
  await writeFile(configPath, `import { appendFileSync } from "node:fs";
import { join as configurationCounterPath } from "node:path";
appendFileSync(configurationCounterPath(import.meta.dirname, ".config-loads"), "loaded\\n");
` + configuration);
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  await symlink(join(sourcePackage, "node_modules"), join(packageRoot, "node_modules"), "junction");
  await writeFile(join(packageRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
      skipLibCheck: true, ignoreDeprecations: "6.0" }, include: ["src/cli.ts"],
  }));
  await writeFile(join(packageRoot, "src/cli.ts"), 'export const marker = "new-native-runtime";');
  await writeFile(join(packageRoot, "src/fixture-schema.json"),
    JSON.stringify(projectKernelSchemas(createProductionSchemaRegistry())));
  await writeFile(join(packageRoot, "src/scripts/build-schema.ts"), `
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import schemas from "../fixture-schema.json";
export async function generateRuntimeSchema(outDir: string): Promise<void> {
  await mkdir(join(outDir, "schemas"), { recursive: true });
  await writeFile(join(outDir, "schemas/kernel.json"), JSON.stringify(schemas));
}
`);
  await mkdir(join(packageRoot, "dist"));
  await writeFile(join(packageRoot, "dist/cli.js"), 'export const marker = "previous-live-runtime";');
  return { root, packageRoot };
}
