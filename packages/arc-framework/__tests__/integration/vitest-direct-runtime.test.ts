/** Direct native setup owns generation while leaving its unmanaged test run unpinned. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";

it("generates under direct preparation ownership and releases before the unmanaged run", async () => {
  const fixture = await makeVitestRuntimeFixture();
  try {
    await writeFile(join(fixture.packageRoot, "src/fixture-build-hook.ts"), `
import { existsSync } from "node:fs";
import { join } from "node:path";
export async function runBuildHook(outDir: string, packageRoot: string): Promise<void> {
  void outDir;
  if (!existsSync(join(packageRoot, ".arc-build.lock"))) throw new Error("direct generation must own artifacts");
}
`);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["run", "--project", "integration"],
      { ARC_E2E_SKIP_BUILD: undefined }, "native");
    expect(result.code, result.stderr).toBe(0);
    const qualification = readBuildQualification(fixture.packageRoot, "runtimeMetafile");
    expect(qualification.status).toBe("qualified");
    const events = (await readFile(fixture.events, "utf8")).split("\n").filter((event) => event.startsWith("{"))
      .map((event) => JSON.parse(event) as { stage: string; owned: boolean });
    expect(events.map((event) => event.stage).sort()).toEqual(["integration:setup", "integration:teardown"]);
    expect(events.every((event) => !event.owned)).toBe(true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
