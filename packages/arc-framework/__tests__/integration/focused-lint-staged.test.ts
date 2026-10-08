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
it("checks every literal staged name before collecting native lint and both type failures", async () => {
  const fixture = await makeStagedFixture();
  const supported = names.filter(({ label }) => process.platform !== "win32" || label === "spaces" || label === "Unicode");
  const observed = join(fixture.packageRoot, "linted-files.jsonl");
  const configuration = join(fixture.packageRoot, "eslint.config.mjs");
  await writeFile(configuration, `
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(fixture.counter)}, "loaded\\n");
export default [{ files: ["src/**/*.ts"], plugins: { fixture: { rules: { files: {
  create(context) { return { Program() { appendFileSync(${JSON.stringify(observed)},
    JSON.stringify(context.filename) + "\\n"); } }; }
} } } }, rules: { "no-unused-vars": "error", "fixture/files": "error" } }];
`);
  const suppressions: Record<string, { "no-unused-vars": { count: number } }> = {};
  const staged: string[] = [];
  for (const { name } of supported) {
    const relativePath = `src/targets/${name}`;
    await writeFile(join(fixture.packageRoot, relativePath), "export function scenario() { const unused = 1; }");
    suppressions[relativePath] = { "no-unused-vars": { count: 1 } };
    staged.push(`packages/arc-framework/${relativePath}`);
  }
  await writeFile(join(fixture.packageRoot, "eslint-suppressions.json"), JSON.stringify(suppressions));
  await execa("git", ["add", "--", ...staged], { cwd: fixture.root });
  const options = { cwd: fixture.root, reject: false as const, timeout: 30_000, env: { FORCE_COLOR: undefined } };
  const clean = await execa("bash", ["scripts/check-ts-quality.sh"], options);
  expect(clean, clean.stderr).toMatchObject({ exitCode: 0 });
  expect(await readFile(fixture.counter, "utf8")).toBe("loaded\n");
  const linted = (await readFile(observed, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as string);
  expect(linted.sort()).toEqual(supported.map(({ name }) => join(fixture.packageRoot, "src/targets", name)).sort());

  await mkdir(join(fixture.packageRoot, "__tests__/unit"), { recursive: true });
  await writeFile(join(fixture.packageRoot, "src/targets/source-type.ts"), 'export const sourceValue: string = 1;');
  await writeFile(join(fixture.packageRoot, "__tests__/unit/test-type.ts"), 'export const testValue: number = "incorrect";');
  const testConfig = join(fixture.packageRoot, "tsconfig.test.json");
  const testConfiguration = JSON.parse(await readFile(testConfig, "utf8")) as { include: string[] };
  testConfiguration.include = ["__tests__/unit/**/*.ts"];
  await writeFile(testConfig, JSON.stringify(testConfiguration));
  await execa("git", ["add", "--", "packages/arc-framework/src/targets/failing.ts"], { cwd: fixture.root });
  const failed = await execa("bash", ["scripts/check-ts-quality.sh"], options);
  expect(failed.exitCode).toBe(1);
  expect(failed.stdout).toContain("no-unused-vars");
  expect(failed.stdout).toContain("source-type.ts(1,14): error TS2322");
  expect(failed.stdout).toContain("test-type.ts(1,14): error TS2322");
  expect(failed.stdout).toContain("TypeScript quality gate failed:");
  expect(failed.stdout).toContain("   lint:ts:file\n   typecheck\n   typecheck:test");
  expect(await readFile(fixture.counter, "utf8")).toBe("loaded\nloaded\n");
}, 60_000);
