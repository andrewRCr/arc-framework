/** Real native writers serialize through closing and retain mergeable private artifacts. */
import { access, cp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  makeNativeWriterFixture, nativeWriterEvents, startNativeWriter, waitForNativeWriter,
} from "../helpers/native-writer-fixture.js";
import { mergeDurationArtifacts } from "../helpers/duration-artifacts.js";

it("holds shared-checkout writers behind the artifact lease until native closing finishes", async () => {
  const fixture = await makeNativeWriterFixture();
  await cp(join(fixture.packageRoot, "tests/integration-runtime.test.mjs"),
    join(fixture.packageRoot, "tests/integration-next.test.mjs"));
  const gate = join(fixture.packageRoot, "close.gate");
  const first = startNativeWriter(fixture.packageRoot, "first", gate, "integration-runtime");
  let second: ReturnType<typeof startNativeWriter> | undefined;
  try {
    await waitForNativeWriter(async () => (await nativeWriterEvents(fixture.events))
      .some(({ stage, writer }) => stage === "closing" && writer === "first"), "first native close");
    const closing = (await nativeWriterEvents(fixture.events)).filter(({ stage }) => stage === "closing");
    expect(closing.length).toBeGreaterThan(0);
    expect(closing.every(({ owned }) => owned)).toBe(true);
    await access(join(fixture.packageRoot, ".arc-build.lock"));
    const report = await readFile(fixture.report, "utf8");
    expect(JSON.parse(report)).toMatchObject({ success: true, numPassedTests: 1 });
    const cache = join(fixture.packageRoot, "node_modules/.vite/vitest");
    expect((await readdir(cache, { recursive: true })).some((path) => path.endsWith("results.json"))).toBe(true);

    second = startNativeWriter(fixture.packageRoot, "second", undefined, "integration-next");
    const waiting = second;
    await waitForNativeWriter(() => waiting.diagnostics().includes("Waiting for checkout artifacts"), "second lease wait");
    expect((await nativeWriterEvents(fixture.events)).some(({ writer }) => writer === "second")).toBe(false);
    expect(await readFile(fixture.report, "utf8")).toBe(report);
    await writeFile(gate, "release");
    const results = await Promise.all([first.child, second.child]);
    for (const result of results) expect(result.exitCode, result.stderr).toBe(0);
    const events = await nativeWriterEvents(fixture.events);
    const lastFirstClose = events.map(({ stage, writer }) => `${writer}:${stage}`).lastIndexOf("first:closed");
    const secondSetup = events.findIndex(({ stage, writer }) => stage === "integration:setup" && writer === "second");
    expect(secondSetup).toBeGreaterThan(lastFirstClose);
    expect(events.filter(({ owned }) => owned !== undefined).every(({ owned }) => owned)).toBe(true);
    expect(JSON.parse(await readFile(fixture.report, "utf8"))).toMatchObject({ success: true, numPassedTests: 1 });
    const download = join(fixture.root, "duration-download");
    await cp(cache, join(download, "duration-results-integration-1"), { recursive: true });
    const output = join(fixture.root, "duration-output");
    mergeDurationArtifacts(download, output);
    const merged = JSON.parse(await readFile(join(output, "integration.json"), "utf8")) as { results: [string, unknown][] };
    expect(merged.results.map(([key]) => key).sort()).toEqual([
      "integration:tests/integration-next.test.mjs", "integration:tests/integration-runtime.test.mjs",
    ]);
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await writeFile(gate, "release");
    await Promise.allSettled([first.child, ...(second === undefined ? [] : [second.child])]);
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);

it("finishes a separate-copy writer during another copy's closing and merges native durations", async () => {
  const fixtures = [await makeNativeWriterFixture(), await makeNativeWriterFixture()];
  const firstFixture = fixtures[0]!;
  const secondFixture = fixtures[1]!;
  for (const [index, fixture] of fixtures.entries()) {
    await rename(join(fixture.packageRoot, "tests/integration-runtime.test.mjs"),
      join(fixture.packageRoot, `tests/integration-${index}.test.mjs`));
  }
  const gate = join(firstFixture.packageRoot, "close.gate");
  const first = startNativeWriter(firstFixture.packageRoot, "first", gate);
  let second: ReturnType<typeof startNativeWriter> | undefined;
  try {
    await waitForNativeWriter(async () => (await nativeWriterEvents(firstFixture.events))
      .some(({ stage }) => stage === "closing"), "first private close");
    second = startNativeWriter(secondFixture.packageRoot, "second");
    const completed = await second.child;
    expect(completed.exitCode, completed.stderr).toBe(0);
    expect((await nativeWriterEvents(firstFixture.events)).some(({ stage }) => stage === "closed")).toBe(false);
    const download = join(firstFixture.root, "duration-download");
    const cacheRoots = await Promise.all(fixtures.map(async (fixture, index) => {
      const cache = join(fixture.packageRoot, "node_modules/.vite/vitest");
      expect(await realpath(cache)).toBe(cache);
      expect(JSON.parse(await readFile(fixture.report, "utf8"))).toMatchObject({ success: true, numPassedTests: 1 });
      await cp(cache, join(download, `duration-results-integration-${index + 1}`), { recursive: true });
      return await realpath(cache);
    }));
    expect(new Set(cacheRoots).size).toBe(2);
    await writeFile(gate, "release");
    const firstResult = await first.child;
    expect(firstResult.exitCode, firstResult.stderr).toBe(0);
    const output = join(firstFixture.root, "duration-output");
    mergeDurationArtifacts(download, output);
    const merged = JSON.parse(await readFile(join(output, "integration.json"), "utf8")) as {
      results: [string, { duration: number; failed: boolean }][];
    };
    expect(merged.results.map(([key]) => key).sort()).toEqual([
      "integration:tests/integration-0.test.mjs", "integration:tests/integration-1.test.mjs",
    ]);
    for (const [, result] of merged.results) {
      expect(result.failed).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    }
  } finally {
    await writeFile(gate, "release");
    await Promise.allSettled([first.child, ...(second === undefined ? [] : [second.child])]);
    await Promise.all(fixtures.map(async (fixture) => await rm(fixture.root, { recursive: true, force: true })));
  }
}, 60_000);
