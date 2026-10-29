/** Ordinary integration shards retain native nonpassing empty-work outcomes through controller closing. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeWriterFixture, nativeWriterEvents } from "../helpers/native-writer-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it.each(["unmatched name", "all skipped", "oversubscribed selection"] as const)(
  "keeps ordinary integration %s nonpassing and closes the native controller", async kind => {
    const fixture = await makeNativeWriterFixture();
    try {
      if (kind === "all skipped") {
        const file = join(fixture.packageRoot, "tests/integration-runtime.test.mjs");
        await writeFile(file, (await readFile(file, "utf8")).replace('it("consumes qualified runtime', 'it.skip("consumes qualified runtime'));
      }
      const flags = kind === "unmatched name" ? ["--testNamePattern", "^no-native-case-matches$"]
        : kind === "oversubscribed selection" ? ["--shard=2/4"] : [];
      const result = await runVitestControllerFixture(fixture.packageRoot, ["integration", ...flags], {
        // The outer test owns admission; this tiny disposable controller checks native completion and artifact closing.
        CI: "1", FORCE_COLOR: undefined, ARC_E2E_SKIP_BUILD: undefined,
      });
      expect(result.code, result.stdout + result.stderr).toBe(1);
      expect(result.stdout + result.stderr).toContain(kind === "oversubscribed selection"
        ? "Resolved 1 test files for --shard=2/4" : "No test cases completed");
      const events = await nativeWriterEvents(fixture.events);
      expect(events.at(-1)?.stage).toBe("closed");
      expect(events.find(event => event.stage === "closing")?.owned).toBe(true);
      await expect(readFile(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  }, 60_000,
);
