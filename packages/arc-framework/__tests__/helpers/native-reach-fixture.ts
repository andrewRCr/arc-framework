/** Small real reach controllers with multiple native execution groups and observable assignments. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { copyLiveDependencies } from "./copy-live-dependencies.js";
import { makeNativeShardFixture } from "./native-shard-fixture.js";

/** Compose the native reach entry with three projects sharing filenames across distinct execution groups. */
export async function makeNativeReachFixture(selectedNames: readonly string[] = ["a", "b", "c"]) {
  const fixture = await makeNativeShardFixture();
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), fixture.packageRoot, ["src/lib/reach-check.ts"]);
  for (const name of ["a", "b", "c"]) {
    const file = join(fixture.packageRoot, "tests", `${name}.test.mjs`);
    await writeFile(file, (await readFile(file, "utf8")).replaceAll("unit", "integration"));
  }
  const projects = ["integration", "integration-timing", "integration-bursts"].map((name, groupOrder) => ({ test: {
    name, root: fixture.packageRoot, include: ["tests/*.test.mjs"], sequence: { groupOrder },
    provide: { nativeProject: name },
  } }));
  await writeFile(join(fixture.packageRoot, "vitest.config.mjs"), `
import { observeNativeShards } from "./__tests__/helpers/native-shard-observer.ts";
export default observeNativeShards({ test: { watch: false, maxWorkers: 1, projects: ${JSON.stringify(projects)} } });
`);
  const entry = join(fixture.packageRoot, "reach.mjs");
  await writeFile(entry, `
import { runReachSuites } from "./src/lib/reach-check.ts";
try {
  await runReachSuites({ checkoutRoot: ${JSON.stringify(fixture.root)}, packageRoot: process.cwd(),
    declaration: { name: "fixture suites" }, arguments: process.argv.slice(2), env: process.env },
    ${JSON.stringify(selectedNames)}.map(name => "packages/arc-framework/tests/" + name + ".test.mjs"));
} catch (error) { console.error(error); process.exitCode = 1; }
`);
  return { ...fixture, entry };
}
