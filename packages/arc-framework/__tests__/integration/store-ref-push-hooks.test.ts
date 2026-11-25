import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { refCarryFixture, carriedBranch, carriedDocument, carryProvenance } from "../helpers/store/ref-carry.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { createRefStore, PushResultSchema, RecordReferenceSchema, type RefStorePorts } from "../../src/lib/store/index.js";

async function localHook(h: Awaited<ReturnType<typeof refCarryFixture>>, script: string, ports: Partial<RefStorePorts> = {}) {
  const directory = join(h.a.root, "controlled-hooks"), hook = join(directory, "pre-push");
  await mkdir(directory);
  await writeFile(hook, script, { mode: 0o755 });
  const exec = ports.exec ?? h.a.ports.exec;
  const store = createRefStore({ ...h.a.ports, ...ports, exec: (command, args, options) => exec(command,
    args.includes("push") ? ["-c", `core.hooksPath=${directory}`, ...args] : args, options) });
  return { store, hook };
}

describe("receiver atomic capability", () => {
  it("falls back to ordered code and state when the receiver lacks atomic pushes", async () => {
    const h = await refCarryFixture("default");
    await h.remote("git", ["config", "receive.advertiseAtomic", "false"]);
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(h.code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  });

  it.each(["default", "separate"] as const)("refuses a multi-ref state batch until atomic capability is restored (%s)", async (layout) => {
    const h = await refCarryFixture(layout);
    const claim = RecordReferenceSchema.parse({ kind: "claims/groom", key: "atomic", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: claim, expected: null, content: "{}", provenance: carryProvenance }));
    await h.remote("git", ["config", "receive.advertiseAtomic", "false"]);
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", failure: expect.objectContaining({
      code: "refused", class: "terminal", message: expect.stringContaining("does not support --atomic"),
      remedy: { text: expect.stringMatching(/enable atomic/iu) },
    }) })]);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference: claim })).content).toBe("{}");
    await h.remote("git", ["config", "receive.advertiseAtomic", "true"]);
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
    expect(success(await h.b.store.read({ reference: claim })).content).toBe("{}");
  });
});

it.skipIf(process.platform === "win32").each(["default", "separate"] as const)("cancels a sleeping push hook and names its repair (%s)", async (layout) => {
  const h = await refCarryFixture(layout), ready = join(h.a.root, "hook-ready"), clock = createRefClock(new Date(0), 0);
  let pids: number[] = [], armed = true;
  const { store, hook } = await localHook(h, `#!/bin/sh
sleep 30 &
helper=$!
printf '%s\\n' "$$" "$helper" > '${ready}'
wait "$helper"
`, { ...clock, exec: async (command, args, options) => {
    const pending = h.a.ports.exec(command, args, options);
    if (!armed || !args.includes("push")) return pending;
    armed = false;
    void pending.catch(() => undefined);
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        pids = await readFile(ready, "utf8").then((text) => text.trim().split("\n").map(Number), () => []);
        if (pids.length === 2) break;
        await delay(5);
      }
      expect(pids).toHaveLength(2);
    } finally { clock.advance(120_001); }
    return pending;
  } });
  try {
    const result = PushResultSchema.parse(success(await store.push()));
    expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) })]);
    expect(clock.clock().getTime()).toBe(120_001);
    let running: number[] = [];
    for (let attempt = 0; attempt < 100; attempt++) {
      const { stdout } = await promisify(execFile)("ps", ["-A", "-o", "pid=,stat="]);
      running = stdout.split("\n").flatMap((line) => {
        const row = /^\s*(\d+)\s+(\S+)/u.exec(line);
        return row && pids.includes(Number(row[1])) && !row[2]?.startsWith("Z") ? [Number(row[1])] : [];
      });
      if (!running.length) break;
      await delay(5);
    }
    expect(running).toEqual([]);
    expect(result.publishes).toContainEqual(expect.objectContaining({ failure: expect.objectContaining({
      remedy: { text: expect.stringMatching(/pre-push[\s\S]*refs\/arc\//u) },
    }) }));
    await rm(hook);
    success(await store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  } finally {
    for (const pid of pids) try { process.kill(pid, "SIGKILL"); } catch { /* The canceled process is gone. */ }
  }
}, 15_000);

it.each(["default", "separate"] as const)("a hook declining code preserves its text and lets state publish (%s)", async (layout) => {
  const h = await refCarryFixture(layout);
  const text = "code hook: complete recorded review first\n";
  const { store, hook } = await localHook(h, `#!/bin/sh
while read local source remote before; do
  case "$remote" in
    refs/arc/*) ;;
    *) printf '${text}' >&2; exit 1 ;;
  esac
done
`);
  const result = PushResultSchema.parse(success(await store.push({ carry: { ref: carriedBranch } })));
  expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "hook-declined", message: expect.stringContaining(text) });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"], retryCount: 0 }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", carriedBranch])).stdout).toBe("");
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  await rm(hook);
  expect(success(await store.push({ carry: { ref: carriedBranch } })).carry).toEqual({ ref: carriedBranch, status: "pushed" });
});

it.each(["default", "separate"] as const)("a hook declining state reports its reason and succeeds after repair (%s)", async (layout) => {
  const h = await refCarryFixture(layout), text = "state hook: approval is missing\n";
  const { store, hook } = await localHook(h, `#!/bin/sh\nprintf '${text}' >&2\nexit 1\n`);
  const result = PushResultSchema.parse(success(await store.push()));
  expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", failure: expect.objectContaining({
    code: "refused", class: "terminal", message: expect.stringContaining(text),
  }) })]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(success(await store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  await rm(hook);
  success(await store.push()); success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
});
