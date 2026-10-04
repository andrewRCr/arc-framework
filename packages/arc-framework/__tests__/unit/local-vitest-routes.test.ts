/** Real root npm routes retain their configured tier selections and prepared setup. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";

const routes = [
  { command: "test", runtime: ["integration"] },
  { command: "test:full", runtime: ["e2e", "integration"] },
  { command: "test:integration", runtime: ["integration"] },
  { command: "test:arc-contracts", runtime: ["integration"] },
  { command: "test:e2e", runtime: ["e2e"] },
  { command: "test:e2e:focused", runtime: ["e2e"] },
  { command: "test:portability", runtime: [] },
];
it.each(routes)("preserves native root $command tier membership and owned setup", async ({ command, runtime }) => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await writeFile(join(fixture.packageRoot, "__tests__/unit/advisory-lock-route.test.mjs"),
      'import { it } from "vitest"; it("native portability case", () => { console.log("PORTABILITY-CASE-RAN"); });');
    await writeFile(join(fixture.packageRoot, "__tests__/integration/framework-sync.test.mjs"),
      'import { it } from "vitest"; it("native contract case", () => { console.log("CONTRACT-CASE-RAN"); });');
    const result = await execa("npm", ["run", "-s", command], { cwd: fixture.root, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" },
      reject: false, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    const events = (await readFile(fixture.events, "utf8")).split("\n").filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as { stage: string; owned: boolean; generation: string });
    expect(events.map(({ stage }) => stage).sort()).toEqual(runtime.flatMap((tier) => [`${tier}:setup`, `${tier}:teardown`]).sort());
    expect(new Set(events.map(({ generation }) => generation)).size).toBe(runtime.length === 0 ? 0 : 1);
    for (const event of events) expect(event.owned).toBe(true);
    if (command === "test:portability") expect(result.stdout).toContain("PORTABILITY-CASE-RAN");
    if (command === "test:arc-contracts") expect(result.stdout).toContain("CONTRACT-CASE-RAN");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
