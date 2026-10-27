/** Preparation interruption preserves the original settlement and capture ownership. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("cancels during local capture before adapter launch and waits for owned cleanup", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = join(fixture.root, "adapter-started");
  let entered!: () => void;
  let continueCapture!: () => void;
  const allocating = new Promise<void>(resolve => { entered = resolve; });
  const allowed = new Promise<void>(resolve => { continueCapture = resolve; });
  const source = { ...fixture.io.source, files: { ...fixture.io.source.files, createDirectory: async () => {
    const directory = await fixture.io.source.files.createDirectory();
    entered(); await allowed; return directory;
  } } };
  const attempt = prepareSelectedCheckExecution({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');` + preparedAdapterScript("unknown")] } },
  { ...fixture.io, source });
  await allocating;
  await expect(attempt.cancel()).resolves.toBeUndefined();
  continueCapture();
  const result = await attempt;
  if (result.status === "ready") await result.execution.close();
  expect(result.status).toBe("unavailable");
  await expect(access(marker)).rejects.toThrow();
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});

it("releases a ready context racing cancellation without granting execution authority", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = join(fixture.root, "released.secret");
  let preparing!: () => void;
  const entered = new Promise<void>(resolve => { preparing = resolve; });
  const attempt = prepareSelectedCheckExecution({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("cancel-ready", marker)] }, onDiagnostic: () => { preparing(); } }, fixture.io);
  await entered;
  await attempt.cancel();
  const result = await attempt;
  if (result.status === "ready") await result.execution.close();
  expect(result.status).toBe("unavailable");
  expect(await readFile(marker, "utf8")).toBe("released");
  expect(attempt.retained).toBeUndefined();
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});

it("acknowledges cancellation during preparation without replacing its pending settlement", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const gate = join(fixture.root, "settle.secret");
  let preparing!: () => void;
  const entered = new Promise<void>(resolve => { preparing = resolve; });
  const attempt = prepareSelectedCheckExecution({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("wait-prepare", gate)] },
  onDiagnostic: bytes => { if (Buffer.from(bytes).toString("utf8").includes("waiting for cancellation")) preparing(); } }, fixture.io);
  let settled = false;
  void attempt.then(() => { settled = true; });
  try {
    await entered;
    await expect(attempt.cancel()).resolves.toEqual({ planId: attempt.planId, accepted: true });
    expect(settled).toBe(false);
    expect(attempt.retained?.recovery).toBe("Inspect and settle this test attempt by its plan UUID.");
    if (attempt.retained === undefined) throw new Error("Expected retained capture while preparation is active");
    await expect(access(attempt.retained.sourceRoot)).resolves.toBeUndefined();
  } finally {
    await writeFile(gate, "settle");
    const result = await attempt;
    if (result.status === "ready") await result.execution.close();
  }
  const result = await attempt;
  expect(result).toMatchObject({ status: "unavailable", reason: "Preparation cancelled and settled" });
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
});
