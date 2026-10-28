/** Real adapter processes preserve literal launch and byte-stream conversation boundaries. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCheckRunnerSession } from "../../src/lib/checks/runner/session.js";
import { makeRunnerProtocolPlan } from "../fixtures/checks/runner-protocol.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("launches literal argv in the repository cwd and drains protocol separately from binary diagnostics", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-runner-session-"));
  directories.push(cwd);
  const args = ["one argument", "$(echo injected)", '"quoted"', "a;b", "☃😀"];
  const script = `
    const readline = require('node:readline');
    const lines = readline.createInterface({input: process.stdin});
    lines.on('line', line => {
      const request = JSON.parse(line);
      process.stderr.write(Buffer.from([0,255,10]));
      const result = {status:'unavailable', planId:request.params.planId,
        reason:JSON.stringify({cwd:process.cwd(), args:process.argv.slice(1)}),
        remedy:'Repair the test adapter placement and retry.', settled:true};
      const frame = Buffer.from(JSON.stringify({jsonrpc:'2.0', id:request.id, result})+'\\n');
      const split = frame.indexOf(Buffer.from('☃')) + 1;
      process.stdout.write(frame.subarray(0,split));
      process.stdout.write(frame.subarray(split));
    });
  `;
  const diagnostics: Buffer[] = [];
  const session = createCheckRunnerSession({ argv: [process.execPath, "-e", script, ...args], cwd,
    onNotification: () => undefined, onDiagnostic: bytes => { diagnostics.push(Buffer.from(bytes)); } });
  try {
    const result = await session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") throw new Error("Expected settled refusal");
    expect(JSON.parse(result.reason)).toEqual({ cwd, args });
    await expect(session.close()).resolves.toMatchObject({ status: "closed" });
    await expect(session.closed).resolves.toEqual({ started: true, exitCode: 0 });
    expect(Buffer.concat(diagnostics)).toEqual(Buffer.from([0, 255, 10]));
    expect(session.failure).toBeUndefined();
  } finally { session.terminate(); await session.closed; }
});

it("reports a never-started process without inventing a process exit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-runner-missing-"));
  directories.push(cwd);
  const session = createCheckRunnerSession({ argv: [process.execPath], cwd: join(cwd, "missing-directory"),
    onNotification: () => undefined });
  const pending = session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
  await expect(pending).rejects.toThrow(/runner.*retry/iu);
  await expect(session.closed).resolves.toEqual({ started: false });
  await expect(session.close()).resolves.toMatchObject({ status: "unavailable" });
});

it.each([
  { name: "absolute path", argv: (cwd: string) => [join(cwd, "missing-adapter")] },
  { name: "PATH search", argv: () => ["arc-missing-check-runner-adapter"] },
])("reports a missing executable found by $name as never started on every platform", async ({ argv }) => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-runner-missing-command-"));
  directories.push(cwd);
  const session = createCheckRunnerSession({ argv: argv(cwd) as [string], cwd, onNotification: () => undefined });
  const pending = session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
  await expect(pending).rejects.toThrow(/runner.*retry/iu);
  await expect(session.closed).resolves.toEqual({ started: false });
  await expect(session.close()).resolves.toMatchObject({ status: "unavailable" });
});

it("keeps a started adapter that disappears before preparation settlement uncertain", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-runner-disappeared-"));
  directories.push(cwd);
  const session = createCheckRunnerSession({ argv: [process.execPath, "-e", "process.exit(0)"], cwd,
    onNotification: () => undefined });
  const preparing = session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
  await expect(preparing).rejects.toThrow(/runner.*retry/iu);
  await expect(session.closed).resolves.toEqual({ started: true, exitCode: 0 });
  await expect(session.close()).resolves.toMatchObject({ status: "uncertain" });
});
