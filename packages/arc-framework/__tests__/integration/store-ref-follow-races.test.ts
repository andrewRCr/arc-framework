/** A follow keeps its judged control and captured remote URLs across later moves and partial switches. */
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { createRemoteMover, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { createKindRegistry, createRefStore, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

it("drops stale forwarding tracking and runs the answer as an ordinary setting when the listing finds no record", async () => {
  const h = await followFixture(), follower = h.follower;
  const result = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.fetch-source") await h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]); },
  } })).result;
  expect(result).toMatchObject({ status: "refused", refusal: { code: "role-conflict" } });
  expect((await follower.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/origin/project/moved"])).stdout).toBe("");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect((await invokeStoreRemote(["origin", "off", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
}, 60_000);

it("refuses a new source record and a destination another move left before the follow copy", async () => {
  for (const changed of ["source", "destination"] as const) {
    const h = await followFixture(), follower = h.follower;
    const mover = await createRemoteMover(h, h.destinationDirectory, `later-${changed}`);
    const onward = join(mover.root, "onward.git");
    await mover.exec("git", ["init", "--bare", onward]);
    let beforeSource = "", beforeDestination = "";
    const result = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
      migrateStep: async step => {
        if (step !== (changed === "source" ? "follow.fetch-source" : "follow.fetch-destination")) return;
        if (changed === "source") expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
        expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
        beforeSource = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
        beforeDestination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
      },
    } })).result;
    expect(result).toMatchObject({ status: "refused", refusal: { code: "moved", condition: expect.stringContaining(changed === "source" ? "origin" : "backing") } });
    expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(beforeSource);
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(beforeDestination);
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
    await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(onward)}\n`);
    expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  }
}, 60_000);

it.each(["source", "destination"] as const)("ends a recorded follow whose %s a later move changed, leaving the new move to follow", async changed => {
  const h = await followFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Paused recorded follow"); },
  } })).rejects.toThrow("Paused recorded follow");
  const mover = await createRemoteMover(h, h.destinationDirectory, `later-${changed}`);
  const onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  if (changed === "source") expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  const ended = await invokeStoreMigrate([], follower.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status === "ok") expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("Another move has taken the state") }));
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(onward)}\n`);
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
}, 60_000);

it.each(["before", "during"] as const)("ends recorded follow cleanup after a move back %s its reads and makes the new follow due", async timing => {
  const h = await followFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Paused before follow cleanup"); },
  } })).rejects.toThrow("Paused before follow cleanup");
  const mover = await createRemoteMover(h, h.destinationDirectory, "moving-back");
  let source = "";
  const moveBack = async () => {
    expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
    source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  };
  if (timing === "before") await moveBack();
  const ended = await invokeStoreMigrate([], { ...follower.ports, migrateStep: async step => {
    if (timing === "during" && step === "follow.list-source") await moveBack();
  } });
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  await writeFile(follower.config, "# Checkout updated after the move back.\n");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "origin" });
  expect((await invokeStoreRemote(["origin", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect(success(await follower.store.pull()).states).toEqual([]);
}, 60_000);

it("merges a late source ref with a follower's independent publication on the new remote, reporting a broken rule", async () => {
  const h = await lateFollowFixture(false), follower = h.follower;
  const own = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "new-remote.md" });
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const check: WriteCheck = async ({ reference, next, before }) =>
    reference.key === h.late.key && next?.content === "Prepared late publication.\n" && (await before.read({ reference: own })).status === "ok"
      ? [{ rule: "clear.merged", condition: "The merged copy needs correction.", remedy: { text: "Review the merged copy." } }] : [];
  const result = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    identity: async () => SlugSchema.parse("beth"),
    registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => {
      if (step !== "follow.switched") return;
      await h.landLate();
      const peer = await createRemoteMover(h, h.destinationDirectory, "destination-writer");
      const beth = createRefStore({ ...peer.ports, identity: async () => SlugSchema.parse("beth") });
      success(await beth.write({ action: "put", reference: own, expected: null, content: "New remote publication.\n", provenance }));
      success(await beth.push());
    },
  } })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  expect(result).toMatchObject({ result: { report: { notices: expect.arrayContaining([
    { condition: expect.stringContaining("clear.merged"), remedy: { text: "Review the merged copy." } },
  ]) } } });
  for (const text of ["Prepared late publication.", "New remote publication."]) {
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", text, "refs/arc/user/beth/personal"])).stdout).toContain(text);
  }
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);

it("finishes a backing-to-backing follow using the recorded old URL after its switch", async () => {
  const h = await lateFollowFixture(true, "backing"), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Paused repointed backing"); },
  } })).rejects.toThrow("Paused repointed backing");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  const destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
}, 60_000);

it("always turns the departed backing off even when its old remote cannot be read", async () => {
  const h = await followFixture(undefined, "backing"), follower = h.follower;
  await rename(h.origin, h.origin + ".offline");
  try {
    const off = (await invokeStoreRemote(["backing", "off", "--json"], { cwd: follower.root, ports: follower.ports })).result;
    expect(off, JSON.stringify(off)).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([
      expect.objectContaining({ name: "backing", url: h.origin, role: "off" }),
    ]) } });
    expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  } finally { await rename(h.origin + ".offline", h.origin); }
}, 60_000);

it("propagates a local copy identity read failure without changing roles or remote state and retries", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let copying = false;
  const localReadFailure = makeGitProcessError({ command: "git", args: ["cat-file", "--batch"], exitCode: 128,
    stderr: "Injected local identity object read failure" });
  const broken = { ...follower.ports, migrateStep: async (step: string) => { if (step === "follow.fetch-destination") copying = true; },
    rawExec: async (...args: Parameters<NonNullable<typeof follower.ports.rawExec>>) => {
      const [gitArgs, options] = args;
      if (copying && gitArgs[0] === "cat-file" && gitArgs[1] === "--batch" && new TextDecoder().decode(options?.input).includes(":identity.json")) {
        throw localReadFailure;
      }
      if (!follower.ports.rawExec) throw new Error("Native raw executor missing");
      return follower.ports.rawExec(...args);
    } };
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: broken })).rejects.toBe(localReadFailure);
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
}, 60_000);

it("keeps the original layout and source after a receiver refuses the first copy and retries after repair", async () => {
  const h = await lateFollowFixture(), follower = h.follower, hook = join(h.destinationDirectory, "hooks", "pre-receive");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  await writeFile(hook, "#!/bin/sh\ncat >/dev/null\nprintf 'Follow copy declined\\n' >&2\nexit 1\n");
  await chmod(hook, 0o755);
  const failed = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(failed).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused", class: "terminal", condition: expect.stringContaining("Follow copy declined") } } });
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await rm(hook);
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);
