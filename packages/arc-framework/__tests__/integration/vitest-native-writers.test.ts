/** Real native writers serialize through closing and retain mergeable private artifacts. */
import { access, cp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  makeNativeWriterFixture, nativeWriterEvents, startNativeWriter, waitForNativeWriter,
} from "../helpers/native-writer-fixture.js";
import { mergeDurationArtifacts } from "../helpers/duration-artifacts.js";

it.each([false, true])("holds shared-checkout writers through native closing (failure=%s)", async closingFailure => {
  const fixture = await makeNativeWriterFixture();
  await cp(join(fixture.packageRoot, "tests/integration-runtime.test.mjs"),
    join(fixture.packageRoot, "tests/integration-next.test.mjs"));
  const gate = join(fixture.packageRoot, "close.gate");
  const first = startNativeWriter(fixture.packageRoot, "first", gate, "integration-runtime",
    { NATIVE_WRITER_CLOSE_FAILURE: closingFailure ? "1" : undefined });
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
    expect(results[0]!.exitCode, results[0]!.stderr).toBe(closingFailure ? 1 : 0);
    expect(results[1]!.exitCode, results[1]!.stderr).toBe(0);
    if (closingFailure) expect(results[0]!.stdout + results[0]!.stderr).toContain("native closing failure retained");
    const events = await nativeWriterEvents(fixture.events);
    const lastFirstClose = events.map(({ stage, writer }) => `${writer}:${stage}`).lastIndexOf("first:closed");
    const secondSetup = events.findIndex(({ stage, writer }) => stage === "integration:setup" && writer === "second");
    expect(secondSetup).toBeGreaterThan(lastFirstClose);
    const released = events.filter(({ stage, writer }) => stage === "closing-release" && writer === "first");
    expect(released.length).toBeGreaterThan(0);
    expect(released.every(({ owned }) => owned)).toBe(true);
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
  for (const fixture of fixtures) {
    const config = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(config, 'import { HeavyFirstSequencer } from "./__tests__/helpers/heavy-first-sequencer.ts";\n'
      + (await readFile(config, "utf8")).replace('test: { watch:', 'test: { sequence: { sequencer: HeavyFirstSequencer }, watch:'));
  }
  const handedContents = JSON.stringify({ results: [
    ["integration:tests/integration-0.test.mjs", { duration: 31 }],
    ["integration:tests/integration-1.test.mjs", { duration: 37 }],
  ] });
  const handed = fixtures.map(fixture => join(fixture.packageRoot, "handed-results.json"));
  await Promise.all(handed.map(file => writeFile(file, handedContents)));
  expect(await realpath(join(firstFixture.root, "node_modules")))
    .toBe(await realpath(join(secondFixture.root, "node_modules")));
  expect(new Set(await Promise.all(handed.map(file => realpath(file)))).size).toBe(2);
  const gate = join(firstFixture.packageRoot, "close.gate");
  const first = startNativeWriter(firstFixture.packageRoot, "first", gate, undefined, { ARC_TEST_DURATION_FILE: handed[0] });
  let second: ReturnType<typeof startNativeWriter> | undefined;
  try {
    await waitForNativeWriter(async () => (await nativeWriterEvents(firstFixture.events))
      .some(({ stage }) => stage === "closing"), "first private close");
    second = startNativeWriter(secondFixture.packageRoot, "second", undefined, undefined, { ARC_TEST_DURATION_FILE: handed[1] });
    const completed = await second.child;
    expect(completed.exitCode, completed.stderr).toBe(0);
    expect((await nativeWriterEvents(firstFixture.events)).some(({ stage }) => stage === "closed")).toBe(false);
    for (const [index, fixture] of fixtures.entries()) {
      const observations = (await nativeWriterEvents(fixture.events)).filter(event =>
        event.stage === "integration:setup" || event.stage === "closing");
      expect(observations.length).toBeGreaterThanOrEqual(2);
      for (const event of observations) expect(event.handed).toEqual({
        file: await realpath(handed[index]!), contents: handedContents,
      });
      expect(await readFile(handed[index]!, "utf8")).toBe(handedContents);
    }
    const download = join(firstFixture.root, "duration-download");
    const cacheRoots = await Promise.all(fixtures.map(async (fixture, index) => {
      const cache = join(fixture.packageRoot, "node_modules/.vite/vitest");
      const physical = await realpath(cache);
      expect(physical).toBe(join(await realpath(fixture.packageRoot), "node_modules/.vite/vitest"));
      expect(JSON.parse(await readFile(fixture.report, "utf8"))).toMatchObject({ success: true, numPassedTests: 1 });
      await cp(cache, join(download, `duration-results-integration-${index + 1}`), { recursive: true });
      return physical;
    }));
    expect(new Set(cacheRoots).size).toBe(2);
    await writeFile(gate, "release");
    const firstResult = await first.child;
    expect(firstResult.exitCode, firstResult.stderr).toBe(0);
    for (const [index, fixture] of fixtures.entries()) {
      expect(await readFile(handed[index]!, "utf8")).toBe(handedContents);
      const released = (await nativeWriterEvents(fixture.events)).filter(event => event.stage === "closing-release");
      expect(released.length).toBeGreaterThan(0);
      for (const event of released) {
        expect(event.handed).toEqual({ file: await realpath(handed[index]!), contents: handedContents });
        expect(event.owned).toBe(true);
      }
    }
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
