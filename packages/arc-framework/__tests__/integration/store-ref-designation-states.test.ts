/** Sync-state behavior, terminal independence, and separately published carried code. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createRefStore, PullResultSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { quoteShellArgument } from "../../src/lib/release/commit-message-retry.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { refCarryFixture, carriedBranch, carriedDocument } from "../helpers/store/ref-carry.js";
import { success } from "../helpers/store/suite-tools.js";

const execFileAsync = promisify(execFile);
const firstPull = fileURLToPath(new URL("../fixtures/store/ref-first-pull.ts", import.meta.url));
const processResult = z.strictObject({ tty: z.boolean(), result: z.strictObject({ status: z.literal("ok"), result: PullResultSchema }) });
const projectIdentity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const projectContent = '{"projectId":"34567890-1234-4234-8234-123456789abc"}';

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

async function publishRegistry(h: Awaited<ReturnType<typeof refSyncFixture>>): Promise<void> {
  success(await h.a.store.write({ action: "put", reference: projectIdentity, expected: null,
    content: projectContent, provenance: { verb: "init", lifecycleAction: "seed" } }));
  await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
}

async function runFirstPull(root: string, terminal: boolean) {
  const argv = [process.execPath, "--import", "tsx", firstPull, root];
  const { stdout, stderr } = terminal
    ? await execFileAsync("script", ["-q", "-e", "-c", argv.map(quoteShellArgument).join(" "), "/dev/null"], { timeout: 10_000 })
    : await execFileAsync(process.execPath, argv.slice(1), { timeout: 10_000 });
  expect(stderr).toBe("");
  const payload = stdout.replace(/\r/gu, "").split("\n").find((line) => line.startsWith("{"));
  return processResult.parse(JSON.parse(payload ?? "null"));
}

describe.each([false, true])("first pull with terminal %s", (terminal) => {
  it.skipIf(terminal && process.platform !== "linux").each(["code", "upstream", "empty", "pointer"] as const)(
    "reports the first %s choice independently of terminal availability", async (mode) => {
      const h = await refSyncFixture();
      if (mode === "code" || mode === "upstream") await publishRegistry(h);
      await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
      if (mode === "upstream") {
        const empty = join(h.b.root, "fork.git");
        await h.b.exec("git", ["init", "--bare", empty]);
        await h.b.exec("git", ["remote", "set-url", "origin", empty]);
        await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
      }
      if (mode === "pointer") {
        const directory = join(h.b.root, ".arc", "system");
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, "arc-config.yml"), `storage.backing_repository: ${h.origin}\n`);
      }
      const observed = await runFirstPull(h.b.root, terminal);
      expect(observed.tty).toBe(terminal);
      const result = observed.result.result;
      if (mode === "code") {
        expect(result.states).toEqual([]);
        expect(result.pulls).toMatchObject([{ status: "pulled", role: "state" }]);
        expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
      } else {
        const remote = mode === "upstream" ? "upstream" : mode === "pointer" ? "backing" : "origin";
        const role = mode === "upstream" ? "read" : "push";
        expect(result.states).toMatchObject([{ status: "designation-needed", remote,
          remedy: { argv: ["arc", "store", "remote", remote, role] } }]);
        expect(result.pulls).toEqual([]);
        expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("arc-state");
      }
    }, 15_000,
  );
});

describe("recorded designations", () => {
  it.each(["backing-absent", "code-pointer", "backing-repoint"] as const)("syncs its record under %s", async (mode) => {
    const layout = mode === "code-pointer" ? "default" : "separate";
    const h = await refSyncFixture(layout);
    await publishRegistry(h);
    const pointer = mode === "backing-absent" ? null : join(h.origin, "another.git");
    const store = createRefStore({ ...h.b.ports, backingRepository: async () => pointer });
    const result = PullResultSchema.parse(success(await store.pull()));
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ remote: h.remoteName, role: "state", status: "pulled" }]);
    expect(success(await store.read({ reference: projectIdentity })).content).toBe(projectContent);
    expect((await h.b.git(["remote", "get-url", h.remoteName])).stdout).toBe(h.origin);
    expect((await h.b.exec("git", ["remote"])).stdout).toBe("origin");
  });
});

describe.each(["default", "separate"] as const)("designation-stopped publication (%s)", (layout) => {
  it("carries code alone while state needs a designation", async () => {
    const h = await refCarryFixture(layout);
    await h.a.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.states).toMatchObject([{ status: "designation-needed", remote: h.remoteName }]);
    expect(result.pulls).toEqual([]);
    expect(result.publishes).toEqual([]);
    expect(result.carry).toEqual({ status: "pushed", ref: carriedBranch });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout).toBe(h.code.tip);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
    await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "push"]);
    success(await h.a.store.push());
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  });

  it("fetches and pushes no state while a designation question stops synchronization", async () => {
    const h = await refCarryFixture(layout);
    await h.a.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
    const refs = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc", "refs/arc-remotes"])).stdout;
    const before = await refs();
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (args.includes("fetch") || args.includes("push")) throw new Error("Stopped state attempted transport");
      return h.a.ports.exec(command, args, options);
    } });
    expect(PullResultSchema.parse(success(await store.pull()))).toMatchObject({
      states: [{ status: "designation-needed", remote: h.remoteName }], pulls: [],
    });
    expect(PushResultSchema.parse(success(await store.push()))).toMatchObject({
      states: [{ status: "designation-needed", remote: h.remoteName }], pulls: [], publishes: [],
    });
    expect(await refs()).toBe(before);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  });
});
