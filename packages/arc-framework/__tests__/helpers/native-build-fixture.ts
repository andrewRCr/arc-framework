/** Disposable first-party build sources using the real installed compiler and native loaders. */
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { copyLiveDependencies } from "./copy-live-dependencies.js";

/**
 * Make a native compiler checkout with a tiny CLI and fixture-owned compiler success hook.
 * @returns Fixture root and package boundary for caller-owned cleanup
 */
export async function makeNativeBuildFixture(): Promise<{ root: string; packageRoot: string }> {
  const sourcePackage = resolve(import.meta.dirname, "../..");
  const sourceRoot = resolve(sourcePackage, "../..");
  const root = await mkdtemp(join(tmpdir(), "arc-native-build-"));
  const packageRoot = join(root, "packages/arc-framework");
  await mkdir(packageRoot, { recursive: true });
  await copyLiveDependencies(sourcePackage, packageRoot, [
    "tsup.config.ts", "tsup.fast.config.ts", "build-compiler.config.ts",
    "src/scripts/run-build.ts", "src/scripts/build-compiler.ts",
    "src/lib/build-command.ts", "src/lib/build-generation.ts",
    "src/scripts/run-local-test-tier.ts", "src/scripts/run-focused-tests.ts",
    "src/scripts/measure-test-cost.ts", "src/lib/unit-process-metadata.ts",
  ]);
  for (const file of ["package.json", "package-lock.json"]) {
    await writeFile(join(root, file), await readFile(join(sourceRoot, file)));
  }
  for (const file of ["package.json"]) {
    await writeFile(join(packageRoot, file), await readFile(join(sourcePackage, file)));
  }
  const configPath = join(packageRoot, "tsup.config.ts");
  const configuration = await readFile(configPath, "utf8");
  await writeFile(configPath, `import { appendFileSync } from "node:fs";
import { join as configurationCounterPath } from "node:path";
appendFileSync(configurationCounterPath(import.meta.dirname, ".config-loads"), "loaded\\n");
` + 'import { resolve as fixtureOutputPath } from "node:path";\n'
    + 'import { runBuildHook } from "./src/fixture-build-hook.js";\n'
    + configuration.replace("  metafile: true,", `  metafile: true,
  onSuccess: async () => { await runBuildHook(fixtureOutputPath(import.meta.dirname, outputDirectory), import.meta.dirname); },`));
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  await symlink(join(sourcePackage, "node_modules"), join(packageRoot, "node_modules"), "junction");
  await writeFile(join(packageRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
      skipLibCheck: true, ignoreDeprecations: "6.0" }, include: ["src/cli.ts"],
  }));
  await writeFile(join(packageRoot, "src/cli.ts"), 'export const marker = "new-native-runtime";');
  await writeFile(join(packageRoot, "src/fixture-build-hook.ts"), `
export async function runBuildHook(outDir: string, packageRoot: string): Promise<void> {
  void outDir;
  void packageRoot;
}
`);
  await mkdir(join(packageRoot, "dist"));
  await writeFile(join(packageRoot, "dist/cli.js"), 'export const marker = "previous-live-runtime";');
  return { root, packageRoot };
}
