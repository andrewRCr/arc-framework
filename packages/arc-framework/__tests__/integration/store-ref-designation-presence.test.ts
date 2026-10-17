/** Candidate presence failures and deadlines through real Git transports. */

import { createServer } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

async function candidate() {
  const h = await refSyncFixture();
  await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  return h;
}

async function expectUndesignated(h: Awaited<ReturnType<typeof candidate>>): Promise<void> {
  expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
}

describe("registry presence reads", () => {
  it("reports an unreachable candidate without deciding and retries after repair", async () => {
    const h = await candidate();
    await h.b.exec("git", ["remote", "set-url", "origin", join(h.origin, "missing.git")]);
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ status: "failed", remote: "origin", role: "candidate", notices: [],
      failure: { code: "unreachable", class: "recoverable", cause: "error", remedy: {
        text: expect.stringMatching(/repair.*retry/iu), argv: ["arc", "store", "remote", "origin", "push"],
      } } }]);
    await expectUndesignated(h);
    await h.b.exec("git", ["remote", "set-url", "origin", h.origin]);
    expect(success(await h.b.store.pull()).states).toMatchObject([{ status: "designation-needed", remote: "origin" }]);
    await expectUndesignated(h);
  });

  it("ends a held HTTP presence read at its own bound and recovers on a later pull", async () => {
    const h = await candidate(), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
    let admit: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admit = resolve; });
    const sockets = new Set<Socket>();
    const server = createServer(() => admit?.());
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP endpoint");
    await h.b.exec("git", ["remote", "set-url", "origin", `http://127.0.0.1:${address.port}/repo`]);
    const store = createRefStore({ ...h.b.ports, ...clock });
    const pending = store.pull();
    void pending.catch(() => undefined);
    try {
      await Promise.race([ready, pending.then(() => { throw new Error("Presence ended before HTTP admission"); })]);
      const waiting = Symbol("waiting");
      clock.advance(4999);
      expect(await Promise.race([pending, delay(20).then(() => waiting)])).toBe(waiting);
      clock.advance(1);
      const ended = await Promise.race([pending, delay(1000).then(() => waiting)]);
      expect(ended).not.toBe(waiting);
      if (typeof ended === "symbol") throw new Error("Presence outlived its five-second bound");
      const result = success(ended);
      expect(result.states).toEqual([]);
      expect(result.pulls).toMatchObject([{ remote: "origin", role: "candidate", status: "failed",
        failure: { code: "unreachable", cause: "timeout" } }]);
      await expectUndesignated(h);
      await h.b.exec("git", ["remote", "set-url", "origin", h.origin]);
      expect(success(await store.pull()).states).toMatchObject([{ status: "designation-needed", remote: "origin" }]);
    } finally {
      clock.advance(120_000);
      await pending.catch(() => undefined);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);

  it("accepts a successful registry answer while both deadline bounds are pending", async () => {
    const h = await candidate(), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
    const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    success(await h.a.store.write({ action: "put", reference, expected: null,
      content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: { verb: "init", lifecycleAction: "seed" } }));
    success(await h.a.store.push());
    const store = createRefStore({ ...h.b.ports, ...clock });
    const result = success(await store.pull());
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ role: "state", status: "pulled" }]);
    expect(success(await store.read({ reference })).content).toContain("34567890-1234-4234-8234-123456789abc");
    expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  });

  it("does not mistake a tail-matching ref for the registry itself", async () => {
    const h = await candidate(), phantom = "refs/arc-remotes/x/refs/arc/project/registry";
    const tip = (await h.b.exec("git", ["rev-parse", "HEAD"])).stdout;
    await h.remote("git", ["update-ref", phantom, tip]);
    const advertised = (await h.b.exec("git", ["ls-remote", "--refs", "origin", "refs/arc/project/registry"])).stdout;
    expect(advertised).toContain(phantom);
    const result = success(await h.b.store.pull());
    expect(result.states).toMatchObject([{ status: "designation-needed", remote: "origin" }]);
    expect(result.pulls).toEqual([]);
    await expectUndesignated(h);
  });

});
