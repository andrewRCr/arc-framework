/** Native publication preserves accepted state and contains bounded execution failures. */
import { readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { nativeWindowsCommandLineUnits } from "../../src/lib/git/command-line-capacity.js";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { publishAcceptedWrite } from "../helpers/store/ref-publication.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { createRefClock } from "../helpers/store/ref-clock.js";

it.each(["default", "separate"] as const)("publishes the original accepted write after a timeout (%s)", async layout => {
  const f = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "continuation.md" });
  const accepted = success(await f.a.store.write({ action: "put", reference, expected: null, content: "Accepted once.\n",
    provenance: { verb: "save", lifecycleAction: "edit" } }));
  let interrupted = true;
  const clock = createRefClock();
  const store = createRefStore({ ...f.a.ports, ...clock, exec: async (command, args, options) => {
    if (interrupted && args.includes("push")) {
      clock.advance(120_001);
      await Promise.resolve();
      throw makeGitProcessError({ command, args, isCanceled: true, stderr: "Canceled publication after its deadline" });
    }
    return f.a.ports.exec(command, args, options);
  } });
  const result = await publishAcceptedWrite({ push: async () => {
    try { return await store.push(); } finally { interrupted = false; }
  } });
  expect(result.publicationAttempts, JSON.stringify(result, null, 2)).toHaveLength(2);
  expect(result.publicationAttempts[0]).toMatchObject({ status: "ok", result: {
    publishes: [expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) })],
  } });
  const published = success(result.publication).publishes;
  expect(published.some(outcome => outcome.status === "pushed")).toBe(true);
  expect(published.every(outcome => ["pushed", "noop", "reconciled"].includes(outcome.status))).toBe(true);
  expect(success(await f.b.store.pull()).pulls.every(outcome => outcome.status !== "failed")).toBe(true);
  expect(success(await f.b.store.read({ reference }))).toMatchObject({ content: "Accepted once.\n", version: accepted.version });
  expect((await f.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout)
    .toBe((await f.b.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout);
}, 30_000);


it.skipIf(process.platform !== "win32")("admits the native Windows limit and keeps an oversized invocation unstarted", async () => {
  const h = await refSyncFixture(), marker = join(h.a.root, "capacity-child.txt"), exec = createExecaGitExec();
  const options = { cwd: h.a.root, checkNativeWindowsArgv: true, preserveOutput: true,
    interaction: { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" } } as const;
  const body = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started');process.stdout.write('started')`;
  const base = ["--eval", body, "--"], fixed = nativeWindowsCommandLineUnits(process.execPath, [...base, ""]);
  const admitted = [...base, "x".repeat(32_767 - fixed + 2)];
  expect((await exec(process.execPath, admitted, options)).stdout).toBe("started");
  expect(await readFile(marker, "utf8")).toBe("started"); await rm(marker);
  const refused = [...base, admitted.at(-1)! + "x"];
  await expect(exec(process.execPath, refused, options)).rejects.toMatchObject({ kind: "command-line-capacity",
    stdout: "", stderr: "", commandLine: { units: 32_768, limit: 32_767 } });
  await expect(access(marker)).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(exec(process.execPath, refused, { ...options, signal: controller.signal })).rejects.toMatchObject({ kind: "canceled" });
  const input = "owned stdin\r\n";
  const echoed = await exec(process.execPath, ["--eval", "process.stdin.on('data',b=>process.stdout.write(b));process.stderr.write('diagnostic\\n')"], { ...options, input });
  expect(echoed).toEqual({ stdout: input, stderr: "diagnostic\n" });
}, 30_000);
