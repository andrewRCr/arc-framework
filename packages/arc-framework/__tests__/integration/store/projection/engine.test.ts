/** Command entry over a real repository and the reference store. */
import { access, lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";

import { success } from "../../../helpers/store/suite-tools.js";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { workItemArtifactPath } from "../../../../src/lib/store/lifecycle-storage.js";
import { randomUUID } from "node:crypto";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-store-ports.js";

import { PROJECTION_LOCK_FILE, withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../../../src/lib/renewable-lease.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

describe("projection command entry", () => {
  it("rereads and seeds the checkout claim under the projection lease after a prior path observation", async () => {
    const h = await createEngineFixture(directories);
    const marker = (name: string) => ({ spawnedByArc: true, wuName: name,
      createdFor: { kind: "work-unit" as const, name, uid: randomUUID() }, spawningIdentity: "andrew", createdAt: "2026-11-05T00:00:00Z" });
    await writeWorktreeMarker(h.checkout, marker("alpha"));
    const store = overrideEngineStore(h.store, { version: async () => {
      expect(await workItemArtifactPath(h.checkout, "alpha", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-alpha.md");
      await writeFile(resolveWorktreeMarkerPath(h.checkout), JSON.stringify(marker("beta")));
      return h.store.version();
    } });
    expect(await startProjection({ store, checkout: h.checkout })).toMatchObject({ kind: "ready" });
    expect(await workItemArtifactPath(h.checkout, "beta", "meta", { kind: "active" }, null)).toBe(".arc/active/current/meta-beta.md");
  });

  it("writes a pending edit back before the command and settles its copies at the end", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("opening\nhand edit\nclosing\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect(success(await h.store.read({ reference: h.record.reference })).content).toBe("opening\nhand edit\nclosing\n");
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("hand edit");
    await endProjection({ store: h.store, checkout: h.checkout });
  });

  it("leaves a missing identity's edit untouched and takes it in after identity repair", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("saved by hand\n");
    await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
    expect(await startProjection({ store: h.store, checkout: h.checkout })).toMatchObject({ kind: "skipped", skip: { reason: "no-identity" } });
    expect((await h.stored()).content).toBe("opening\nbase\nclosing\n");
    expect(projectionProcessState().diagnostics[0]?.mark.remedy.text).toContain("git config --local arc.identity");
    await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
    expect((await startProjection({ store: h.store, checkout: h.checkout })).kind).toBe("ready");
    expect((await h.stored()).content).toBe("saved by hand\n");
  });

  it("sends an ignore-refused root's edit without replacing it, then replaces it after repair", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("saved by hand\n");
    const saved = await h.file();
    await writeFile(join(h.checkout, ".gitignore"), "");
    expect((await startProjection({ store: h.store, checkout: h.checkout })).kind).toBe("ready");
    expect((await h.stored()).content).toBe("saved by hand\n");
    expect(await h.file()).toBe(saved);
    expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true, base: h.entry.base, persisted: { stamp: h.entry.base.blob } });
    expect(projectionProcessState().diagnostics.some(d => d.mark.reason.includes("ignore guard"))).toBe(true);
    await writeFile(join(h.checkout, ".gitignore"), ".arc/user/*/\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.disk()).entries[h.path]).toMatchObject({ base: { version: (await h.stored()).version } });
    expect(await h.file()).not.toBe(saved);
  });

  it("waits only to the lock bound and retries successfully once the holder releases", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("saved by hand\n");
    let release = (): void => undefined;
    let acquired = (): void => undefined;
    const held = new Promise<void>(resolve => { acquired = resolve; });
    const holding = withProjectionLock(h.location, async () => { acquired(); await new Promise<void>(resolve => { release = resolve; }); });
    await held;
    try {
      const result = await startProjection({ store: h.store, checkout: h.checkout, ports: () => ({ ...h.ports(), maxWaitMs: 5 }) });
      expect(result).toMatchObject({ kind: "skipped", skip: { reason: "held" } });
      expect((await h.stored()).content).toBe("opening\nbase\nclosing\n");
      expect(await h.file()).toContain("saved by hand");
    } finally { release(); await holding; }
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("saved by hand\n");
  });

  it("stops immediately after a landed store write loses its lease, without advancing the index or replacing bytes", async () => {
    const second = ".arc/user/andrew/second.md";
    const h = await createEngineFixture(directories, { extraPaths: [second] });
    const entry = h.index.entries[second];
    if (entry?.kind !== "record") throw new Error("second entry missing");
    await writeFile(join(h.checkout, second), renderStampedFile({ content: "second edit\n", stamp: entry.base.blob }));
    await h.edit("saved by hand\n");
    const saved = await h.file();
    let now = Date.now();
    let replacement: AdvisoryLockHandle | undefined;
    const store = overrideEngineStore(h.store, { write: async input => {
      const result = await h.store.write(input);
      now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
      replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
        pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
        leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
      });
      return result;
    } });
    const ports = { ...h.ports(), lock: { now: () => now, resolveProcessScope: async () => "original-scope",
      scheduleEvery: () => () => undefined } };
    const result = await startProjection({ store, checkout: h.checkout, ports: () => ports });
    expect((await h.stored()).content).toBe("saved by hand\n");
    expect((await h.disk()).entries[h.path]).toMatchObject({ base: h.entry.base, persisted: null });
    expect(await h.file()).toBe(saved);
    expect(result).toMatchObject({ kind: "skipped", skip: { reason: "lost" }, pending: [h.path, second] });
    expect(projectionProcessState().lockHeld).toBe(false);
    if (replacement === undefined) throw new Error("replacement lock missing");
    await releaseAdvisoryLockConfirmed(replacement);
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.disk()).entries[h.path]).toMatchObject({ base: { version: (await h.stored()).version } });
  });

  it("runs with projection off when the Git directory is gone and retries after it is restored", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("saved by hand\n");
    const { rename } = await import("node:fs/promises");
    const backup = `${h.location.gitDir}-saved`;
    await rename(h.location.gitDir, backup);
    try {
      expect(await startProjection({ store: h.store, checkout: h.checkout, location: h.location }))
        .toMatchObject({ kind: "skipped", skip: { reason: "gone" } });
      expect((await h.stored()).content).toBe("opening\nbase\nclosing\n");
    } finally { await rename(backup, h.location.gitDir); }
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("saved by hand\n");
  });

  it("does no I/O over the in-repo backend, recording its capability before dependency resolution", async () => {
    const checkout = "/not-a-repository";
    const store = createStore(createDefaultStorePorts({ checkoutRoot: checkout,
      exec: async () => { throw new Error("Git must stay dark"); }, execInput: async () => { throw new Error("Git input must stay dark"); } }));
    const input = { store, checkout, ports: () => { throw new Error("engine dependencies must stay dark"); } };
    expect(await startProjection(input)).toEqual({ kind: "disabled" });
    await endProjection(input);
    expect(projectionProcessState().capabilities.get(checkout)).toBe(false);
  });

  it("starts configuration and state reads together only after acquiring the lock", async () => {
    const h = await createEngineFixture(directories);
    const native = h.ports();
    let configStarted = (): void => undefined;
    let versionStarted = (): void => undefined;
    const config = new Promise<void>(resolve => { configStarted = resolve; });
    const version = new Promise<void>(resolve => { versionStarted = resolve; });
    let sharedStarted = (): void => undefined;
    const shared = new Promise<void>(resolve => { sharedStarted = resolve; });
    let identified = false;
    const store = overrideEngineStore(h.store, { version: async () => {
      await access(join(h.location.stateDir, PROJECTION_LOCK_FILE));
      versionStarted();
      await config;
      return h.store.version();
    } });
    const ports = { ...native, walkFs: { readdir, lstat: async (path: string) => {
      await access(join(h.location.stateDir, PROJECTION_LOCK_FILE));
      if (path === join(h.checkout, ".arc/backlog")) sharedStarted();
      if (path.startsWith(`${join(h.checkout, ".arc/user")}${sep}`) && !identified) throw new Error("personal walk ran before identity");
      return lstat(path);
    } }, exec: (async (command, args, options) => {
      if (args.includes("--get-regexp")) {
        await access(join(h.location.stateDir, PROJECTION_LOCK_FILE));
        configStarted();
        await alongside(version);
        await alongside(shared);
      }
      const result = await native.exec(command, args, options);
      if (args.includes("--get-regexp")) identified = true;
      return result;
    }) as typeof native.exec };
    expect((await startProjection({ store, checkout: h.checkout, ports: () => ports })).kind).toBe("ready");
  });


  it("drains a rejected state read before releasing a no-identity start, then retries after repair", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("saved by hand\n");
    await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
    let release = (): void => undefined;
    let configured = (): void => undefined;
    const released = new Promise<void>(resolve => { release = resolve; });
    const configuration = new Promise<void>(resolve => { configured = resolve; });
    const native = h.ports();
    const store = overrideEngineStore(h.store, { version: async () => { await released; throw new Error("state read unavailable"); } });
    const start = startProjection({ store, checkout: h.checkout, ports: () => ({ ...native,
      exec: async (command, args, options) => {
        const result = await native.exec(command, args, options);
        if (args.includes("--get-regexp")) configured();
        return result;
      } }) });
    await configuration;
    await access(join(h.location.stateDir, PROJECTION_LOCK_FILE));
    release();
    expect(await start).toMatchObject({ kind: "skipped", skip: { reason: "no-identity" } });
    await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("saved by hand\n");
  });

  it("preserves a stampless person's removal after a landing beside an ignore-refused root", async () => {
    const h = await createEngineFixture(directories, { path: ".arc/user/andrew/document.txt",
      content: "opening\nbase\nclosing\nuntouched\nremove me\nend\n" });
    await writeFile(join(h.checkout, ".gitignore"), "");
    await h.edit("opening\nlanded\nclosing\nuntouched\nremove me\nend\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nlanded\nclosing\nuntouched\nremove me\nend\n");
    await h.edit("opening\nlanded\nclosing\nuntouched\nend\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nlanded\nclosing\nuntouched\nend\n");
    expect(await h.file()).toBe("opening\nlanded\nclosing\nuntouched\nend\n");
    await writeFile(join(h.checkout, ".gitignore"), ".arc/user/*/\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect(await h.file()).toBe("opening\nlanded\nclosing\nuntouched\nend\n");
  });

});

async function alongside(pending: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error("The state read was not issued alongside configuration")); }, 1000);
    })]);
  } finally { clearTimeout(timer); }
}
