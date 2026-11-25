/** Disposable native unit projects with private writers and observable real sequencing. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { copyLiveDependencies } from "./copy-live-dependencies.js";
import { makeNativeBuildFixture } from "./native-build-fixture.js";

/** Build two named projects that deliberately share module filenames. */
export async function makeNativeShardFixture() {
  const fixture = await makeNativeBuildFixture();
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
