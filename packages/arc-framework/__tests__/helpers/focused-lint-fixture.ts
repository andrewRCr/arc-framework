/** Disposable root/workspace commands using the installed native ESLint CLI. */
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execa } from "execa";

/**
 * Compose real npm scripts, ESLint suppression, and independently failing files.
 * @returns Caller-owned fixture roots and native configuration counter
 */
export async function makeFocusedLintFixture(): Promise<{ root: string; packageRoot: string; counter: string }> {
  const sourcePackage = resolve(import.meta.dirname, "../..");
  const sourceRoot = resolve(sourcePackage, "../..");
  const root = await mkdtemp(join(tmpdir(), "arc-focused-lint-"));
  const packageRoot = join(root, "packages/arc-framework");
  await mkdir(join(packageRoot, "src/targets"), { recursive: true });
  await mkdir(join(packageRoot, "src/extra"));
  await writeFile(join(root, "package.json"), await readFile(join(sourceRoot, "package.json")));
  await writeFile(join(packageRoot, "package.json"), await readFile(join(sourcePackage, "package.json")));
  await cp(join(sourcePackage, "src/scripts"), join(packageRoot, "src/scripts"), { recursive: true });
  await cp(join(sourcePackage, "src/lib"), join(packageRoot, "src/lib"), { recursive: true });
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  await symlink(join(sourcePackage, "node_modules"), join(packageRoot, "node_modules"), "junction");
  const counter = join(packageRoot, "config-loaded");
  await writeFile(join(packageRoot, "eslint.config.mjs"), `
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "loaded\\n");
export default [{ files: ["src/**/*.ts"], rules: { "no-unused-vars": "error" } }];
`);
  await mkdir(join(packageRoot, "native values"));
  await writeFile(join(packageRoot, "native values/alternate config.mjs"),
    'export default [{ files: ["src/**/*.ts"], rules: { "no-unused-vars": "off" } }];');
  await writeFile(join(packageRoot, "src/targets/suppressed.ts"), "const unused = 1;");
  await writeFile(join(packageRoot, "src/targets/failing.ts"), "const unsuppressed = 1;");
  await writeFile(join(packageRoot, "src/extra/additional.ts"), "const additional = 1;");
  await writeFile(join(packageRoot, "eslint-suppressions.json"), JSON.stringify({
    "src/targets/suppressed.ts": { "no-unused-vars": { count: 1 } },
  }));
  return { root, packageRoot, counter };
}

/**
 * Run the real root npm focused lint boundary.
 * @param root - Fixture checkout cwd
 * @param args - Root targets and optionally delimited native tokens
 * @returns Native exit status and diagnostics
 */
export async function runFocusedLintFixture(root: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = await execa("npm", ["run", "-s", "lint:ts:file", "--", ...args],
    { cwd: root, reject: false, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return { code: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}
