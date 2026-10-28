/** Request-wide exceptional cleanup owns concurrent local capture and adapter preparation. */
import { afterEach, expect, it, vi } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCheckRunnerRequestControl } from "../../src/lib/checks/runner/request-control.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { waitForRunnerObservation } from "../fixtures/checks/runner-cli.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await removeGitBackedDirs(directories.splice(0));
});

it("cancels and awaits all owned preparations on an exceptional request exit", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const control = createCheckRunnerRequestControl();
  const gate = join(fixture.stateRoot, "settle");
  let enterCapture: () => void = () => undefined;
  let releaseCapture: () => void = () => undefined;
  const captured = new Promise<void>(resolve => { enterCapture = resolve; });
  const allowed = new Promise<void>(resolve => { releaseCapture = resolve; });
  const capturing = control.prepare(fixture.input, { ...fixture.io, source: { ...fixture.io.source,
    files: { ...fixture.io.source.files, createDirectory: async () => {
      const directory = await fixture.io.source.files.createDirectory();
      enterCapture(); await allowed; return directory;
    } } } });
  const attached = control.prepare({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("wait-prepare", gate, fixture.stateRoot)] } }, fixture.io);
  await captured;
  await waitForRunnerObservation(join(fixture.stateRoot, "preparing"));
  const retained = attached.retained;
  if (retained === undefined) throw new Error("Expected an owned adapter preparation");
  let finished = false;
  const finishing = control.finish(true).then(result => { finished = true; return result; });
  try {
    const cancellation = JSON.parse(await waitForRunnerObservation(join(fixture.stateRoot, "cancel"))) as { planId: string };
    expect(cancellation.planId).toBe(attached.planId);
    expect(control.interrupted).toBe(true);
    expect(finished).toBe(false);
    await expect(access(retained.sourceRoot)).resolves.toBeUndefined();
    releaseCapture();
    expect((await capturing).status).toBe("unavailable");
    expect(finished).toBe(false);
    await expect(access(retained.sourceRoot)).resolves.toBeUndefined();
    await writeFile(gate, "settle");
    expect((await attached).status).toBe("unavailable");
    await expect(finishing).resolves.toEqual([]);
    expect(() => control.prepare(fixture.input, fixture.io)).toThrow("closed");
    expect(capturing.retained).toBeUndefined();
    expect(attached.retained).toBeUndefined();
    for (const directory of fixture.captures) await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    releaseCapture();
    await writeFile(gate, "settle");
    await Promise.allSettled([capturing.cancel(), attached.cancel()]);
    for (const result of await Promise.all([capturing, attached])) if (result.status === "ready") await result.execution.close();
    await finishing;
  }
}, 30_000);

it("names a plan that already closed uncertain when a third interrupt exits without waiting", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const control = createCheckRunnerRequestControl();
  const before = new Set(process.listeners("SIGINT"));
  const attempt = control.prepare({ ...fixture.input, configuration: { ...fixture.input.configuration,
    argv: [process.execPath, "-e", preparedAdapterScript("wait-prepare", join(fixture.stateRoot, "settle"), fixture.stateRoot)] } }, fixture.io);
  const interrupt = process.listeners("SIGINT").find(listener => !before.has(listener));
  if (interrupt === undefined) throw new Error("Expected the request's interrupt listener");
  const original = process.kill.bind(process);
  const raised: unknown[] = [];
  vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (pid !== process.pid) return original(pid, signal);
    raised.push(signal);
    return true;
  });
  const messages: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
  await waitForRunnerObservation(join(fixture.stateRoot, "preparing"));
  interrupt("SIGINT");
  await waitForRunnerObservation(join(fixture.stateRoot, "cancel"));
  interrupt("SIGINT");
  const prepared = await attempt;
  if (prepared.status !== "uncertain") throw new Error(`Expected an uncertain closure, got ${prepared.status}`);
  directories.push(dirname(prepared.retained.manifest));
  interrupt("SIGINT");
  expect(messages.at(-1)).toContain(`inspect and settle retained plans before retrying: ${attempt.planId}.`);
  expect(raised).toEqual(["SIGINT"]);
  expect(process.listeners("SIGINT")).not.toContain(interrupt);
  await expect(control.finish(false)).resolves.toMatchObject([{ planId: attempt.planId }]);
}, 30_000);
