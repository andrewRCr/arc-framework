import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { refCarryFixture as carryFixture, carriedBranch as branch, carriedDocument as reference, carryProvenance as provenance } from "../helpers/store/ref-carry.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema, PushResultSchema, PushInputSchema } from "../../src/lib/store/index.js";

describe.each(["default", "separate"] as const)("carried code in the %s layout", (layout) => {
  it("publishes code and state together or in ordered receiver transactions", async () => {
    const h = await carryFixture(layout), log = join(h.origin, "received.log");
    await writeFile(join(h.origin, "hooks", "pre-receive"), `#!/bin/sh\ncat >> '${log}'\nprintf '%s\\n' '--push--' >> '${log}'\n`, { mode: 0o755 });
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: branch } })));
    expect(result.carry).toEqual({ ref: branch, status: "pushed" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(h.code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("Carried state.\n");
    const transactions = (await readFile(log, "utf8")).split("--push--\n").filter(Boolean);
    expect(transactions).toHaveLength(layout === "default" ? 1 : 2);
    expect(transactions[0]).toContain(branch);
    expect(transactions.at(-1)).toContain("refs/arc/user/andrew/personal");
  });

  it.each(["plain", "stale", "unseen"] as const)("publishes state after the carried branch's own %s rejection", async (mode) => {
    const h = await carryFixture(layout);
    await h.a.exec("git", ["push", "origin", `${branch}:${branch}`]);
    const rewrite = await plantRef(h.a.root, branch, [{ path: "rewrite.txt", content: "Independent rewrite.\n" }]);
    if (mode !== "plain") {
      const moved = await plantRef(h.b.root, branch, [{ path: "other.txt", content: "Other writer.\n" }]);
      await h.b.exec("git", ["push", "--force", "origin", `${branch}:${branch}`]);
      expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(moved.tip);
    }
    const input = PushInputSchema.parse({ carry: { ref: branch, ...mode === "stale" ? { expect: h.code.tip } : {} } });
    const clock = createRefClock(new Date(0), 0);
    const store = createRefStore({ ...h.a.ports, ...clock, sleep: { ...clock.sleep,
      wait: async () => { clock.advance(120_001); } } });
    const result = PushResultSchema.parse(success(await store.push(input)));
    const reason = mode === "plain" ? "non-fast-forward" : mode === "stale" ? "stale-info" : "fetch-first";
    expect(result.carry).toMatchObject({ ref: branch, status: "refused", reason });
    expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).not.toBe(rewrite.tip);
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"], retryCount: 0 }));
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("Carried state.\n");
  });

  it("publishes a rewritten branch under its explicit lease", async () => {
    const h = await carryFixture(layout);
    await h.a.exec("git", ["push", "origin", `${branch}:${branch}`]);
    const rewrite = await plantRef(h.a.root, branch, [{ path: "rewrite.txt", content: "Authorized rewrite.\n" }]);
    const result = PushResultSchema.parse(success(await h.a.store.push(PushInputSchema.parse({ carry: { ref: branch, expect: h.code.tip } }))));
    expect(result.carry).toEqual({ ref: branch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(rewrite.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("Carried state.\n");
  });

  it.each(["failed pull", "diverged ref"] as const)("publishes code alone when state stops on a %s", async (stop) => {
    const h = await carryFixture(layout), state = "refs/arc/user/andrew/personal";
    let remoteTip: string | undefined;
    if (stop === "diverged ref") {
      success(await h.a.store.push()); success(await h.b.store.pull());
      const before = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: before.version, content: "Pending local state.\n", provenance }));
      const rows = (await h.b.git(["ls-tree", "-r", "--format=%(objectname) %(path)", state])).stdout.split("\n").filter(Boolean);
      const rewritten = await plantRef(h.b.root, state, rows.map((row) => {
        const at = row.indexOf(" "); return { oid: row.slice(0, at), path: row.slice(at + 1), mode: "100644" as const };
      }), { gitDir: h.b.gitDir });
      remoteTip = rewritten.tip;
      await h.b.git(["push", "--force", h.remoteName, `${state}:${state}`]);
    } else {
      await h.a.git(["remote", "set-url", h.remoteName, join(h.origin, "missing.git")]);
      if (layout === "default") await h.a.exec("git", ["remote", "set-url", "--push", "origin", h.origin]);
    }
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: branch } })));
    expect(result.carry).toEqual({ ref: branch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(h.code.tip);
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed" }));
    const expectedContent = stop === "diverged ref" ? "Pending local state.\n" : "Carried state.\n";
    expect(success(await h.a.store.read({ reference })).content).toBe(expectedContent);
    if (remoteTip) await h.a.git(["push", `--force-with-lease=${state}:${remoteTip}`, h.remoteName, `${state}:${state}`]);
    else await h.a.git(["remote", "set-url", h.remoteName, h.origin]);
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe(expectedContent);
  });
});

it("keeps an unreachable ordered code leg independent and retries it after repair", async () => {
  const h = await carryFixture("separate");
  await h.a.exec("git", ["remote", "set-url", "origin", join(h.origin, "missing.git")]);
  const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: branch } })));
  expect(result.carry).toMatchObject({ ref: branch, status: "unreachable", cause: expect.any(String) });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Carried state.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", branch])).stdout).toBe("");
  await h.a.exec("git", ["remote", "set-url", "origin", h.origin]);
  expect(success(await h.a.store.push({ carry: { ref: branch } })).carry).toEqual({ ref: branch, status: "pushed" });
  expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(h.code.tip);
});

it("reports no code push destination while its backing state still publishes", async () => {
  const h = await carryFixture("separate");
  await h.a.exec("git", ["remote", "remove", "origin"]);
  const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: branch } })));
  expect(result.carry).toMatchObject({ ref: branch, status: "refused", reason: "no-push-destination" });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", branch])).stdout).toBe("");
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Carried state.\n");
  await h.a.exec("git", ["remote", "add", "origin", h.origin]);
  expect(success(await h.a.store.push({ carry: { ref: branch } })).carry).toEqual({ ref: branch, status: "pushed" });
  expect((await h.remote("git", ["rev-parse", branch])).stdout.trim()).toBe(h.code.tip);
});

it("reports a code ref that never landed when state retries exhaust the shared deadline", async () => {
  const h = await carryFixture("default"), state = "refs/arc/user/andrew/personal";
  success(await h.a.store.push()); success(await h.b.store.pull());
  const pending = RecordReferenceSchema.parse({ ...reference, key: "pending.md" });
  const concurrent = RecordReferenceSchema.parse({ ...reference, key: "concurrent.md" });
  success(await h.a.store.write({ action: "put", reference: pending, expected: null, content: "Pending state.\n", provenance }));
  const clock = createRefClock(new Date(0), 0);
  let armed = true;
  const store = createRefStore({ ...h.a.ports, ...clock, sleep: { ...clock.sleep, wait: async () => { clock.advance(120_001); } },
    exec: async (command, args, options) => {
      if (armed && args.includes("push")) {
        armed = false;
        success(await h.b.store.write({ action: "put", reference: concurrent, expected: null, content: "Concurrent state.\n", provenance }));
        await h.b.git(["push", "origin", `${state}:${state}`]);
      }
      return h.a.ports.exec(command, args, options);
    } });
  const result = PushResultSchema.parse(success(await store.push({ carry: { ref: branch } })));
  expect(result.carry).toEqual({ ref: branch, status: "unreachable", cause: "timeout" });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", retryCount: 1,
    failure: expect.objectContaining({ code: "retries-exhausted" }) }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", branch])).stdout).toBe("");
  expect(success(await store.read({ reference: pending })).content).toBe("Pending state.\n");
  expect(success(await store.push({ carry: { ref: branch } })).carry).toEqual({ ref: branch, status: "pushed" });
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: pending })).content).toBe("Pending state.\n");
  expect(success(await h.b.store.read({ reference: concurrent })).content).toBe("Concurrent state.\n");
});
