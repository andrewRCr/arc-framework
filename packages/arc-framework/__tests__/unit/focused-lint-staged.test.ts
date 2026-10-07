/** Real staged Git names traverse the hook, root adapter, and native quality tools. */
import { execa } from "execa";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedLintFixture } from "../helpers/focused-lint-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
const sourceRoot = resolve(import.meta.dirname, "../../../..");

async function makeStagedFixture() {
  const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
  await mkdir(join(fixture.root, "scripts"));
  await cp(join(sourceRoot, "scripts/check-ts-quality.sh"), join(fixture.root, "scripts/check-ts-quality.sh"));
  const libraryRoot = join(fixture.root, ".arc/system/.internal/scripts");
  await mkdir(libraryRoot, { recursive: true });
  await cp(join(sourceRoot, ".arc/system/.internal/scripts/arc-lib.sh"), join(libraryRoot, "arc-lib.sh"));
  const compilerOptions = { strict: true, skipLibCheck: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext",
    ignoreDeprecations: "6.0" };
  await writeFile(join(fixture.packageRoot, "tsconfig.json"), JSON.stringify({ compilerOptions, include: ["src/targets/**/*.ts"] }));
  await writeFile(join(fixture.packageRoot, "tsconfig.test.json"), JSON.stringify({ compilerOptions, include: ["src/targets/**/*.ts"] }));
  await execa("git", ["init", "-q"], { cwd: fixture.root });
  return fixture;
}

const names = [{ label: "spaces", name: "space name.ts" }, { label: "Unicode", name: "über-工具.ts" },
  { label: "tabs", name: "tab\tname.ts" }, { label: "newlines", name: "line\nname.ts" }];
it.each(names.filter(({ label }) => process.platform !== "win32" || label === "spaces" || label === "Unicode"))(
  "lints a literal staged filename containing $label against the native suppression baseline", async ({ name }) => {
    const fixture = await makeStagedFixture();
    const relativePath = `src/targets/${name}`;
    await writeFile(join(fixture.packageRoot, relativePath), "export function scenario() { const unused = 1; }");
    await writeFile(join(fixture.packageRoot, "eslint-suppressions.json"), JSON.stringify({
      [relativePath]: { "no-unused-vars": { count: 1 } },
    }));
    await execa("git", ["add", "--", `packages/arc-framework/${relativePath}`], { cwd: fixture.root });
    const result = await execa("bash", ["scripts/check-ts-quality.sh"], { cwd: fixture.root, reject: false, timeout: 30_000, env: { FORCE_COLOR: undefined } });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(await readFile(fixture.counter, "utf8")).toBe("loaded\n");
  }, 30_000,
);

it("rejects native staged lint failure even when both type checks pass", async () => {
  const fixture = await makeStagedFixture();
  await execa("git", ["add", "--", "packages/arc-framework/src/targets/failing.ts"], { cwd: fixture.root });
  const result = await execa("bash", ["scripts/check-ts-quality.sh"], { cwd: fixture.root, reject: false, timeout: 30_000, env: { FORCE_COLOR: undefined } });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("no-unused-vars");
  expect(result.stdout).toContain("   lint:ts:file");
}, 30_000);

it("collects native lint, source-type, and test-type failures in one staged check", async () => {
  const fixture = await makeStagedFixture();
  await mkdir(join(fixture.packageRoot, "__tests__/unit"), { recursive: true });
  await writeFile(join(fixture.packageRoot, "src/targets/source-type.ts"), 'export const sourceValue: string = 1;');
  await writeFile(join(fixture.packageRoot, "__tests__/unit/test-type.ts"), 'export const testValue: number = "incorrect";');
  const testConfig = join(fixture.packageRoot, "tsconfig.test.json");
  const configuration = JSON.parse(await readFile(testConfig, "utf8")) as { include: string[] };
  configuration.include = ["__tests__/unit/**/*.ts"];
  await writeFile(testConfig, JSON.stringify(configuration));
  await execa("git", ["add", "--", "packages/arc-framework/src/targets/failing.ts"], { cwd: fixture.root });
  const result = await execa("bash", ["scripts/check-ts-quality.sh"], { cwd: fixture.root, reject: false, timeout: 30_000, env: { FORCE_COLOR: undefined } });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("source-type.ts(1,14): error TS2322");
  expect(result.stdout).toContain("test-type.ts(1,14): error TS2322");
  expect(result.stdout).toContain("TypeScript quality gate failed:");
  expect(result.stdout).toContain("   lint:ts:file\n   typecheck\n   typecheck:test");
}, 30_000);
