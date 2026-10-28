/** Historical follow observations cannot replace or clear a later source's comparison evidence. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";

const moved = "refs/arc/project/moved", recordRef = "refs/arc/tmp/migrate/move";
type GitSide = { git: (args: string[]) => Promise<{ stdout: string }> };
const tip = async (side: GitSide, ref: string) => (await side.git(["for-each-ref", "--format=%(objectname)", ref])).stdout.trim();

/** Preserve the genuine public migration's exact tree and standalone-root shape, changing only its actor. */
async function replacementForwarding(side: GitSide, existing: string, actor = "Later forwarding publisher") {
  const tree = (await side.git(["rev-parse", `${existing}^{tree}`])).stdout.trim();
  return (await side.git(["-c", `user.name=${actor}`, "-c", "user.email=forwarding-fixture@example.com",
    "commit-tree", tree, "-m", "Record project state forwarding"])).stdout.trim();
}

async function staleFixture() {
  const h = await followFixture(undefined, "backing"), side = h.follower;
  const tracking = "refs/arc-remotes/backing/project/moved", original = await tip(side, tracking);
  return { h, side, tracking, original };
}

/** Run the real no-target command, pausing only after its isolated old-source absence observation. */
async function judgeWithdrawal(f: Awaited<ReturnType<typeof staleFixture>>, afterRead: () => Promise<void>) {
  await f.h.remote("git", ["update-ref", "-d", moved, f.original]);
  let observed = false;
  const result = await invokeStoreMigrate([], { ...f.side.ports, exec: async (command, args, options) => {
    const acquired = await f.side.ports.exec(command, args, options);
    if (!observed && args.includes("fetch") && args.includes(f.h.origin)
      && options?.input?.includes("refs/arc/tmp/follow/source/")) {
      observed = true;
      expect((await f.side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/source/"])).stdout).toBe("");
      await afterRead();
    }
    return acquired;
  } });
  expect(observed).toBe(true);
  return result;
}

it.each(["newer", "absent"] as const)("leaves a same-source %s observation intact after exact-tip withdrawal evidence", async current => {
  const f = await staleFixture(), newer = await replacementForwarding(f.side, f.original);
  expect(newer).not.toBe(f.original);
  const ended = await judgeWithdrawal(f, async () => {
    if (current === "newer") await f.side.git(["push", "--", f.h.origin, `${newer}:${moved}`]);
    // A separate native Git fetch supplies the current source observation while historical judgment is pending.
    await f.side.git(["fetch", "--prune", "--refmap=", "--", f.h.origin,
      "+refs/arc/project/moved*:refs/arc-remotes/backing/project/moved*"]);
    expect(await tip(f.side, f.tracking)).toBe(current === "newer" ? newer : "");
  });
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect(await tip(f.side, f.tracking)).toBe(current === "newer" ? newer : "");
}, 60_000);

it("does not clear equal forwarding OIDs after a stable effective fetch-source replacement", async () => {
  const f = await staleFixture(), replacement = join(f.side.root, "replacement-source.git"), alias = "arc-follow-source:";
  await f.side.exec("git", ["clone", "--bare", f.h.origin, replacement]);
  await f.side.git(["push", "--", replacement, `${f.original}:${moved}`]);
  await f.side.git(["remote", "set-url", "backing", alias]);
  await f.side.git(["config", `url.${f.h.origin}.insteadOf`, alias]);
  const ended = await judgeWithdrawal(f, async () => {
    await f.side.git(["config", "--unset-all", `url.${f.h.origin}.insteadOf`]);
    await f.side.git(["config", `url.${replacement}.insteadOf`, alias]);
    await f.side.git(["fetch", "--refmap=", "--", "backing", `+${moved}:${f.tracking}`]);
    expect((await f.side.git(["config", "remote.backing.url"])).stdout.trim()).toBe(alias);
    expect(await tip(f.side, f.tracking)).toBe(f.original);
  });
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect(await tip(f.side, f.tracking)).toBe(f.original);
}, 60_000);

it.each(["read", "off", "invalid-push-only"] as const)("clears exact stale source evidence after a stable %s configuration change", async change => {
  const f = await staleFixture();
  const ended = await judgeWithdrawal(f, async () => {
    // The public command has already captured and observed O; only finalization sees this stable change.
    if (change === "invalid-push-only") await f.side.git(["config", "remote.backing.pushurl", "invalid\npush-only"]);
    else await f.side.git(["config", "remote.backing.arc-state", change]);
  });
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect(await tip(f.side, f.tracking)).toBe("");
}, 60_000);

it.each(["judgment", "answer-copy"] as const)("preserves the replacement source's equal tip through the public %s withdrawal command", async route => {
  // The code-source answer path deliberately retains origin push, so its subsequent ordinary backing setting refuses.
  const h = await followFixture(undefined, route === "judgment" ? "backing" : "code"), side = h.follower;
  const name = route === "judgment" ? "backing" : "origin", tracking = `refs/arc-remotes/${name}/project/moved`;
  const replacement = join(side.root, "equal-source.git"), original = await tip(side, tracking);
  await side.exec("git", ["clone", "--bare", h.origin, replacement]);
  await side.git(["push", "--", replacement, `${original}:${moved}`]);
  let armed = route === "judgment", observed = false;
  const ports: RefStorePorts = { ...side.ports,
    migrateStep: async step => {
      if (route === "answer-copy" && step === "follow.fetch-source") {
        await h.remote("git", ["update-ref", "-d", moved, original]); armed = true;
      }
    },
    exec: async (command, args, options) => {
      const result = await side.ports.exec(command, args, options);
      const prefix = route === "judgment" ? "refs/arc/tmp/follow/source/" : "refs/arc/tmp/migrate/remote/";
      if (armed && args.includes("fetch") && options?.input?.includes(prefix) && args.includes(h.origin)) {
        armed = false; observed = true;
        await side.git(["remote", "set-url", name, replacement]);
        // Real external acquisition, not nested ARC reentry while the migration lock is held.
        await side.git(["fetch", "--refmap=", "--", replacement, `+${moved}:${tracking}`]);
        expect(await tip(side, tracking)).toBe(original);
      }
      return result;
    },
  };
  if (route === "judgment") {
    await h.remote("git", ["update-ref", "-d", moved, original]);
    const result = await invokeStoreMigrate([], ports);
    expect(result.status, JSON.stringify(result)).toBe("ok");
  } else {
    const result = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports })).result;
    expect(result).toMatchObject({ status: "refused", refusal: { code: "role-conflict", report: {
      refs: expect.any(Array), notices: expect.any(Array),
    } } });
  }
  expect(observed).toBe(true);
  expect(await tip(side, tracking)).toBe(original);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", moved])).stdout).toBe("");
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", recordRef])).stdout).toBe("");
}, 60_000);

async function recordedCleanup() {
  const h = await lateFollowFixture(true), side = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports: { ...side.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Paused recorded cleanup"); },
  } })).rejects.toThrow("Paused recorded cleanup");
  const mover = await createRemoteMover(h, h.destinationDirectory, "later-forwarding");
  const onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  return { h, side, mover, onward };
}

it.each(["same-source-newer", "replacement-newer", "replacement-absent", "push-only-change"] as const)(
  "keeps current comparison evidence after an isolated later-forwarding read (%s)", async change => {
    const f = await recordedCleanup();
    expect((await invokeStoreMigrate(["--to", f.onward], f.mover.ports)).status).toBe("ok");
    const forwarding = (await f.side.exec("git", [`--git-dir=${f.h.destinationDirectory}`, "rev-parse", moved])).stdout.trim();
    // Acquire the genuine producer's root before constructing a second independent forwarding root.
    await f.side.git(["fetch", "--refmap=", "--", f.h.destinationDirectory, `${moved}:refs/test/forwarding-root`]);
    const newer = await replacementForwarding(f.side, forwarding);
    expect(newer).not.toBe(forwarding);
    const replacement = join(f.side.root, "later-source.git");
    await f.side.exec("git", ["init", "--bare", replacement]);
    if (change === "replacement-newer") await f.side.git(["push", "--", replacement, `${newer}:${moved}`]);
    const sourceBefore = (await f.h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    let observed = false;
    const ports: RefStorePorts = { ...f.side.ports, exec: async (command, args, options) => {
      const result = await f.side.ports.exec(command, args, options);
      if (!observed && args.includes("fetch") && args.includes(f.h.destinationDirectory)
        && options?.input?.includes("refs/arc/tmp/migrate/remote/")) {
        observed = true;
        if (change === "push-only-change") {
          await f.side.git(["config", "remote.backing.pushurl", "invalid\npush-only"]);
          await f.side.git(["config", "remote.backing.arc-state", "off"]);
        } else {
          const source = change === "same-source-newer" ? f.h.destinationDirectory : replacement;
          if (change === "same-source-newer") await f.side.git(["push", "--force", "--", source, `${newer}:${moved}`]);
          else await f.side.git(["remote", "set-url", "backing", source]);
          // External Git acquisition explicitly supplies the later observation during the recorded operation.
          await f.side.git(["fetch", "--prune", "--refmap=", "--", source,
            "+refs/arc/project/moved*:refs/arc-remotes/backing/project/moved*"]);
        }
      }
      return result;
    } };
    const ended = await invokeStoreMigrate([], ports);
    expect(observed).toBe(true);
    expect(ended.status, JSON.stringify(ended)).toBe("ok");
    if (ended.status !== "ok") throw new Error("Expected a historical later-move report");
    expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("later move") }));
    expect(ended.result.notices.some(row => row.condition.includes(moved) && row.condition.includes(f.h.destinationDirectory))).toBe(true);
    expect(await tip(f.side, "refs/arc-remotes/backing/project/moved")).toBe(change === "push-only-change" ? forwarding
      : change === "replacement-absent" ? "" : newer);
    expect((await f.h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(sourceBefore);
    expect((await f.side.exec("git", ["for-each-ref", "--format=%(refname)", recordRef])).stdout).toBe("");
  }, 60_000);

it("captures a separate basis before the changed-source cleanup's second destination observation", async () => {
  const f = await recordedCleanup();
  let destinationReads = 0, changed = false, forwarding = "", newer = "";
  const ports: RefStorePorts = { ...f.side.ports,
    migrateStep: async step => {
      if (step !== "follow.list-source" || changed) return;
      changed = true;
      await f.h.remote("git", ["update-ref", "-d", moved]);
      expect((await invokeStoreMigrate(["--to", f.onward], f.mover.ports)).status).toBe("ok");
      forwarding = (await f.side.exec("git", [`--git-dir=${f.h.destinationDirectory}`, "rev-parse", moved])).stdout.trim();
      await f.side.git(["fetch", "--refmap=", "--", f.h.destinationDirectory, `${moved}:refs/test/second-read-root`]);
      newer = await replacementForwarding(f.side, forwarding);
    },
    exec: async (command, args, options) => {
      const result = await f.side.ports.exec(command, args, options);
      if (args.includes("fetch") && args.includes(f.h.destinationDirectory)
        && options?.input?.includes("refs/arc/tmp/migrate/remote/") && ++destinationReads === 2) {
        await f.side.git(["push", "--force", "--", f.h.destinationDirectory, `${newer}:${moved}`]);
        await f.side.git(["fetch", "--refmap=", "--", f.h.destinationDirectory,
          `+${moved}:refs/arc-remotes/backing/project/moved`]);
      }
      return result;
    },
  };
  const ended = await invokeStoreMigrate([], ports);
  expect(destinationReads).toBe(2);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Expected an ended cleanup report");
  expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("later move") }));
  expect(await tip(f.side, "refs/arc-remotes/backing/project/moved")).toBe(newer);
}, 60_000);

it("ends a recorded withdrawal without selecting a newly sampled forwarding tip for deletion", async () => {
  const h = await followFixture(), side = h.follower;
  const tracking = "refs/arc-remotes/origin/project/moved", original = await tip(side, tracking);
  const fresh = await replacementForwarding(side, original);
  await side.git(["push", "--force", "--", h.origin, `${fresh}:${moved}`]);
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports: { ...side.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Paused at recorded answer"); },
  } })).rejects.toThrow("Paused at recorded answer");
  const record = JSON.parse((await side.exec("git", ["show", `${recordRef}:move.json`])).stdout) as { forwardingTip: string };
  expect(record.forwardingTip).toBe(fresh);
  expect(record.forwardingTip).not.toBe(original);
  const newer = await replacementForwarding(side, fresh, "Newest forwarding publisher");
  expect(newer).not.toBe(fresh);
  await h.remote("git", ["update-ref", "-d", moved, fresh]);
  let observed = false;
  const ended = await invokeStoreMigrate([], { ...side.ports, exec: async (command, args, options) => {
    const result = await side.ports.exec(command, args, options);
    if (!observed && args.includes("fetch") && args.includes(h.origin)
      && options?.input?.includes("refs/arc/tmp/migrate/remote/")) {
      observed = true;
      await side.git(["push", "--", h.origin, `${newer}:${moved}`]);
      await side.git(["fetch", "--refmap=", "--", h.origin, `+${moved}:${tracking}`]);
    }
    return result;
  } });
  expect(observed).toBe(true);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Expected historical withdrawal completion");
  expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("stale follow ended") }));
  expect(await tip(side, tracking)).toBe(newer);
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", recordRef])).stdout).toBe("");
}, 60_000);
