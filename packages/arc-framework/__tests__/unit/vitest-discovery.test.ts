/** Native discovery precedes admission and retains the controller closing boundary. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it("rejects empty discovery before attempting Git-backed admission and closes the controller", async () => {
  const fixture = await makeVitestControllerFixture();
  try {
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full", "absent.test.mjs"],
      { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" });
    expect(result.stderr).toContain("No configured test specifications match the selection");
    expect(result.stderr).not.toContain("not a git repository");
    expect(result.code).toBe(1);
    expect(await readFile(fixture.events, "utf8")).toContain("closed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("rejects an empty pre-parsed selection before admission and setup", async () => {
  const fixture = await makeVitestControllerFixture(true);
  try {
    await writeFile(join(fixture.packageRoot, "tests/integration-skipped.test.mjs"),
      'import { it } from "vitest"; it.skip("skipped before setup", () => {});');
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full"],
      { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" });
    expect(result.stderr).toContain("No configured test specifications match the selection");
    expect(result.stderr).not.toContain("not a git repository");
    expect(result.code).toBe(1);
    const events = await readFile(fixture.events, "utf8");
    expect(events).not.toContain("integration-setup");
    expect(events).toContain("closed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("preserves native parsing errors before setup instead of explaining them as empty selection", async () => {
  const fixture = await makeVitestControllerFixture(true);
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-broken.test.mjs"),
      'import { it } from "vitest"; it("broken", () => { ;');
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unit-broken.test.mjs");
    expect(result.stderr).not.toContain("No configured test specifications");
    const events = await readFile(fixture.events, "utf8");
    expect(events).not.toContain("unit-setup");
    expect(events).toContain("closed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("refines mixed native discovery with cross-file only before Git-backed heavy admission", async () => {
  const fixture = await makeVitestControllerFixture(true);
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-selected.test.mjs"), `
import { it } from "vitest";
import { appendFileSync } from "node:fs";
it.only("chosen unit", () => appendFileSync(${JSON.stringify(fixture.events)}, "unit-worker\\n"));
`);
    await writeFile(join(fixture.packageRoot, "tests/integration-excluded.test.mjs"), `
import { it } from "vitest";
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(fixture.events)}, "integration-module\\n");
it("excluded integration", () => appendFileSync(${JSON.stringify(fixture.events)}, "integration-worker\\n"));
`);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full"],
      { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" });
    expect(result.code, result.stderr).toBe(0);
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain("unit-worker");
    expect(events).not.toContain("integration-");
    expect(events).toContain("closed");
    await writeFile(fixture.events, "");
    const native = await runVitestControllerFixture(fixture.packageRoot, ["run"], { CI: "" }, "native");
    expect(native.code, native.stderr).toBe(0);
    const nativeEvents = await readFile(fixture.events, "utf8");
    expect(nativeEvents).toContain("unit-worker");
    expect(nativeEvents).not.toContain("integration-");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it("keeps mixed discovery heavy when native pre-parsing is disabled", async () => {
  const fixture = await makeVitestControllerFixture(false);
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-selected.test.mjs"),
      'import { it } from "vitest"; it.only("chosen unit", () => {});');
    await writeFile(join(fixture.packageRoot, "tests/integration-excluded.test.mjs"),
      'import { it } from "vitest"; it("integration", () => {});');
    const result = await runVitestControllerFixture(fixture.packageRoot, ["full"],
      { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not a git repository");
    const events = await readFile(fixture.events, "utf8");
    expect(events).not.toContain("integration-setup");
    expect(events).toContain("closed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
