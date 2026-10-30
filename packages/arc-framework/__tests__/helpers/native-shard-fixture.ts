/** Disposable native unit projects with private writers and observable real sequencing. */
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { copyLiveDependencies } from "./copy-live-dependencies.js";
import { makeNativeBuildFixture } from "./native-build-fixture.js";

/** Build two named projects that deliberately share module filenames. */
export async function makeNativeShardFixture() {
  const built = await makeNativeBuildFixture();
  // Vitest's module ids may expand a Windows 8.3 alias in the temporary directory's path; work from the long form.
  const fixture = { root: await realpath(built.root), packageRoot: await realpath(built.packageRoot) };
  await rm(join(fixture.packageRoot, "node_modules"));
  await mkdir(join(fixture.packageRoot, "node_modules"));
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), fixture.packageRoot, [
    "__tests__/helpers/native-shard-observer.ts",
  ]);
  await mkdir(join(fixture.packageRoot, "tests"));
  for (const name of ["a", "b", "c"]) {
    await writeFile(join(fixture.packageRoot, "tests", `${name}.test.mjs`), `
import { it, expect, inject } from "vitest";
it("executes ${name} in its native project", () => expect(inject("nativeProject")).toMatch(/^unit/u));
`);
  }
  await writeFile(join(fixture.packageRoot, "vitest.config.mjs"), `
import { observeNativeShards } from "./__tests__/helpers/native-shard-observer.ts";
export default observeNativeShards({ test: {
  watch: false, maxWorkers: 1, experimental: { preParse: true },
  projects: [
    { test: { name: "unit", root: import.meta.dirname, include: ["tests/*.test.mjs"],
      isolate: false, provide: { nativeProject: "unit" } } },
    { test: { name: "unit-mocks", root: import.meta.dirname, include: ["tests/*.test.mjs"],
      isolate: true, provide: { nativeProject: "unit-mocks" } } }
  ]
} });
`);
  return fixture;
}
