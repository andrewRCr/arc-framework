import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, PushResultSchema } from "../../src/lib/store/index.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { refCarryFixture, carriedBranch, carriedDocument } from "../helpers/store/ref-carry.js";
import { success } from "../helpers/store/suite-tools.js";

it.each((["default", "separate"] as const).flatMap(layout => (["state", "carry", "both"] as const).map(mode => ({ layout, mode }))))(
  "retains unstarted state and settles only its independent code leg ($layout, $mode)", async ({ layout, mode }) => {
  const h = await refCarryFixture(layout), log = join(h.origin, "capacity-received.log");
  await writeFile(join(h.origin, "hooks", "pre-receive"), `#!/bin/sh\ncat >> '${log}'\n`, { mode: 0o755 });
  const pending = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let blocked = true;
  const store = createRefStore({ ...h.a.ports, exec: (command, args, options) => {
    if (blocked && options?.checkNativeWindowsArgv && args.includes("push")
      && (args.some(arg => arg.includes(":refs/arc/")) || mode === "both")) {
      throw new GitProcessError({ kind: "command-line-capacity", command, args, commandLine: { units: 40_000, limit: 32_767 } });
    }
    return h.a.ports.exec(command, args, options);
  } });
  const input = mode === "state" ? {} : { carry: { ref: carriedBranch } };
  const result = PushResultSchema.parse(success(await store.push(input)));
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", retryCount: 0,
    failure: { code: "command-line-capacity", class: "recoverable", condition: expect.stringMatching(/not start|capacity/iu),
      remedy: { text: expect.stringMatching(/retry/iu) } } }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(pending);
  expect(success(await store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  const received = await readFile(log, "utf8").catch(() => "");
  if (mode === "carry") {
    expect(result.carry).toEqual({ status: "pushed", ref: carriedBranch });
    expect(received.trim().split(/\s+/u).at(-1)).toBe(carriedBranch);
  } else {
    expect(received).toBe("");
    if (mode === "both") expect(result.carry).toMatchObject({ status: "refused", reason: "command-line-capacity" });
  }
  blocked = false;
  expect(success(await store.push(input)).publishes.every(row => row.status !== "failed")).toBe(true);
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
}, 90_000);
