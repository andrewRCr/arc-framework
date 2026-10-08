/** Native custom coverage reports distinguish initial execution from a partial public run. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";

it("reports unexecuted fixture source during supported initial coverage", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    const configuration = join(fixture.packageRoot, "vitest.config.ts");
    const report = join(fixture.packageRoot, "coverage-report.json");
    const unexecuted = join(fixture.packageRoot, "src/unexecuted-fixture.ts");
    await writeFile(unexecuted, "export const unexecuted = true;");
    await writeFile(configuration, (await readFile(configuration, "utf8")).replace('test: { watch:',
      'test: { coverage: { enabled: true, provider: "custom", customProviderModule: "./tests/coverage-provider.mjs" }, watch:'));
    await writeFile(join(fixture.packageRoot, "tests/coverage-provider.mjs"), `
import { writeFileSync } from "node:fs";
let options;
export default { getProvider() { return {
  name: "fixture",
  initialize(controller) { options = controller.config.coverage; },
  resolveOptions() { return options; },
  clean() {}, onAfterSuiteRun() {},
  generateCoverage({ allTestsRun }) { return { sourceFiles: allTestsRun ? [${JSON.stringify(unexecuted)}] : [] }; },
  reportCoverage(coverage) { writeFileSync(${JSON.stringify(report)}, JSON.stringify(coverage)); },
}; } };
`);
    await writeFile(join(fixture.packageRoot, "tests/coverage-control.mjs"), `
import { discoverVitestSelection } from "../src/lib/vitest-discovery.ts";
const selection = await discoverVitestSelection(["__tests__/unit/named.test.mjs"],
  { run: true, config: "vitest.config.ts", project: ["unit"] });
try { await selection.controller.runTestSpecifications(selection.specifications); }
finally { await selection.controller.close(); }
`);
    const native = await execa(process.execPath, ["--import", "tsx", "tests/coverage-control.mjs"],
      { cwd: fixture.packageRoot, reject: false, timeout: 30_000 });
    expect(native, native.stderr).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(await readFile(report, "utf8"))).toEqual({ sourceFiles: [] });
    const supported = await execa("npm", ["run", "-s", "test:unit", "-w", "packages/arc-framework", "--", "__tests__/unit/named.test.mjs"],
      { cwd: fixture.root, reject: false, timeout: 30_000 });
    expect(supported, supported.stderr).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(await readFile(report, "utf8"))).toEqual({ sourceFiles: [unexecuted] });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
