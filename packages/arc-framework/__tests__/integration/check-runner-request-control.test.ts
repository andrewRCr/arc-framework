/** Request-wide exceptional cleanup owns concurrent local capture and adapter preparation. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCheckRunnerRequestControl } from "../../src/lib/checks/runner/request-control.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { waitForRunnerObservation } from "../fixtures/checks/runner-cli.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

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
