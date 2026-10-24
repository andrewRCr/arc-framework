/** Follow decisions judge the departed remote's current move before any clone changes its designation. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { createRemoteMover, identity, switchFixture, provenance } from "../helpers/store/remote-move.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";


it("guards settings while a follow is due and always permits switching the departed remote off", async () => {
  const h = await followFixture(), follower = h.follower;
  const other = (await invokeStoreRemote(["origin", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(other).toMatchObject({ status: "refused", refusal: { code: "role-conflict", remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  const off = (await invokeStoreRemote(["origin", "off", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(off.status, JSON.stringify(off)).toBe("ok");
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);

it("uses the fresh record across a move back and onward, independent of candidate fetch order", async () => {
  const h = await followFixture(), follower = h.follower;
  const cached = (await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout.trim();
  const mover = await createRemoteMover(h, h.destinationDirectory, "returning-mover");
  expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
  const fork = join(h.a.root, "between-moves.git");
  await h.a.exec("git", ["init", "--bare", fork]);
  const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.remote("git", ["push", "--atomic", fork, ...refs.map(ref => `${ref}:${ref}`)]);
  const onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  const newest = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  expect(newest).not.toBe(cached);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(fork)}\n`);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "follow-refused", condition: expect.stringContaining("move's commit") } });
  expect((await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout.trim()).toBe(cached);
  const refreshed = success(await follower.store.pull());
  expect(refreshed.states).toContainEqual(expect.objectContaining({ status: "moved" }));
  expect(refreshed.pulls.flatMap(row => row.notices)).toEqual([]);
  expect((await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout.trim()).toBe(newest);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(onward)}\n`);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  for (const newestFirst of [false, true]) {
    const fresh = await createRemoteMover(h, h.origin, newestFirst ? "new-first" : "old-first");
    const urls = newestFirst ? [onward, fork] : [fork, onward];
    for (const [index, url] of urls.entries()) {
      const name = index === 0 ? "a" : "z";
      await fresh.exec("git", ["remote", "add", name, url]);
      await fresh.exec("git", ["config", `remote.${name}.arc-state`, "off"]);
    }
    expect(await invokeStoreMigrate([], fresh.ports)).toMatchObject({ status: "designation-needed", remote: newestFirst ? "a" : "z" });
    expect((await fresh.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/"])).stdout).toBe("");
  }
}, 60_000);

it("drops a stale forwarding tracking ref when the departed remote no longer carries a record", async () => {
  const h = await followFixture(), follower = h.follower;
  const local = (await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/"])).stdout;
  await h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect((await follower.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/origin/project/moved"])).stdout).toBe("");
  expect((await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/"])).stdout).toBe(local);
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
}, 60_000);

it("refuses a freshly malformed source record and resumes candidate selection after its repair", async () => {
  const h = await followFixture(), follower = h.follower;
  const original = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  const malformed = await plantRef(h.origin, "refs/arc/project/moved", [{ path: "moved.json", content: "Malformed forwarding data" }], { gitDir: h.origin });
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-record-malformed", condition: expect.stringContaining("refs/arc/project/moved") } });
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim()).toBe(malformed.tip);
  expect((await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout.trim()).toBe(original);
  await h.remote("git", ["update-ref", "refs/arc/project/moved", original, malformed.tip]);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/"])).stdout).toBe("");
}, 60_000);

it.each([false, true])("judges a read follower by the departed project while own publication is %s", async ownPush => {
  const h = await switchFixture(), own = await refSyncFixture();
  const ownId = "45678901-1234-4234-8234-123456789abc";
  success(await own.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: ownId }), provenance }));
  success(await own.a.store.push());
  const config = join(own.a.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(own.a.root, ".arc", "system"), { recursive: true });
  await writeFile(config, "# A reader with its own project identity.\n");
  const production = createStoreCommandPorts(own.a.root);
  const ports = { ...production, ...own.a.ports, backingRepository: production.backingRepository }, store = createRefStore(ports);
  if (!ownPush) expect((await invokeStoreRemote(["origin", "off", "--json"], { cwd: own.a.root, ports })).result.status).toBe("ok");
  await own.a.exec("git", ["remote", "add", "upstream", h.origin]);
  await own.a.exec("git", ["config", "remote.upstream.arc-state", "read"]);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  expect(success(await store.pull()).pulls).toContainEqual(expect.objectContaining({ remote: "upstream", status: "failed", failure: expect.objectContaining({
    code: "refused", class: "terminal", remedy: expect.objectContaining({ text: expect.stringContaining("arc store migrate") }),
  }) }));
  await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
  const judgment = await invokeStoreMigrate([], ports);
  if (!ownPush) {
    expect(judgment).toMatchObject({ status: "designation-needed", remote: "backing", remedy: { argv: ["arc", "store", "remote", "backing", "read"] } });
    expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: own.a.root, ports })).result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch" } } });
    expect((await own.a.exec("git", ["config", "remote.upstream.arc-state"])).stdout.trim()).toBe("read");
    expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: own.a.root, ports })).result.status).toBe("ok");
    expect((await own.a.exec("git", ["config", "remote.upstream.arc-state"])).stdout.trim()).toBe("off");
    expect(success(await store.pull()).pulls).toContainEqual(expect.objectContaining({ remote: "backing", role: "read", status: "pulled" }));
  } else {
    expect(judgment).toMatchObject({ status: "refused", refusal: { code: "follow-refused", remedy: { text: expect.stringMatching(/another.*remote|read source/iu) } } });
    expect((await invokeStoreRemote(["upstream", "off", "--json"], { cwd: own.a.root, ports })).result.status).toBe("ok");
    expect(await invokeStoreMigrate([], ports)).toMatchObject({ status: "ok", result: { refs: [] } });
    expect(success(await store.pull()).pulls.filter(({ remote }) => remote === "upstream")).toEqual([]);
    await own.a.exec("git", ["remote", "add", "moved-source", h.destinationDirectory]);
    expect((await invokeStoreRemote(["moved-source", "read", "--json"], { cwd: own.a.root, ports })).result.status).toBe("ok");
    expect(success(await store.pull()).pulls).toContainEqual(expect.objectContaining({ remote: "moved-source", role: "read", status: "pulled" }));
  }
  expect(JSON.parse(success(await store.read({ reference: identity })).content)).toEqual({ projectId: ownId });
}, 60_000);

it.each(["forwarded", "foreign", "pre-move"] as const)("rejects a %s pointer candidate and accepts its repaired destination", async fault => {
  const h = await followFixture(), follower = h.follower;
  let target = join(h.a.root, "candidate.git"), repaired = h.destinationDirectory;
  if (fault === "forwarded") {
    const mover = await createRemoteMover(h, h.destinationDirectory, "later-mover");
    repaired = join(mover.root, "onward.git");
    await mover.exec("git", ["init", "--bare", repaired]);
    await expect(invokeStoreMigrate(["--to", repaired], { ...mover.ports, migrateStep: async step => {
      if (step === "remote.forwarded") throw new Error("Paused later forwarding");
    } })).rejects.toThrow("Paused later forwarding");
    target = h.destinationDirectory;
  } else if (fault === "foreign") {
    const foreign = await refSyncFixture();
    success(await foreign.a.store.write({ action: "put", reference: identity, expected: null,
      content: JSON.stringify({ projectId: "45678901-1234-4234-8234-123456789abc" }), provenance }));
    success(await foreign.a.store.push());
    target = foreign.origin;
  } else {
    await follower.exec("git", ["init", "--bare", target]);
    await follower.git(["push", target, "refs/arc/project/registry:refs/arc/project/registry"]);
  }
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(target)}\n`);
  const before = (await follower.exec("git", [`--git-dir=${target}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  if (fault === "forwarded") {
    const tip = (await follower.exec("git", [`--git-dir=${target}`, "rev-parse", "refs/arc/project/moved"])).stdout.trim();
    const brokenRead = { ...follower.ports, rawExec: async (...args: Parameters<NonNullable<typeof follower.ports.rawExec>>) => {
      const [gitArgs, options] = args;
      if (gitArgs[0] === "cat-file" && gitArgs[1] === "--batch" && new TextDecoder().decode(options?.input).includes(`${tip}:moved.json`)) {
        throw makeGitProcessError({ command: "git", args: gitArgs, exitCode: 128, stderr: "Injected candidate record read failure" });
      }
      if (!follower.ports.rawExec) throw new Error("Native raw executor missing");
      return follower.ports.rawExec(...args);
    } };
    expect(await invokeStoreMigrate([], brokenRead)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
      code: "unreachable", condition: expect.stringContaining("backing"),
    } } });
  }
  const refused = await invokeStoreMigrate([], follower.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "follow-refused", condition: expect.stringContaining(
    fault === "forwarded" ? "forwarding record" : fault === "foreign" ? "project" : "move's commit",
  ) } });
  expect((await follower.exec("git", [`--git-dir=${target}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(repaired)}\n`);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/"])).stdout).toBe("");
}, 60_000);

it("names every accepted code remote regardless of role and asks once only one remains", async () => {
  const h = await followFixture(), follower = h.follower, duplicate = join(h.a.root, "duplicate.git");
  await follower.exec("git", ["init", "--bare", duplicate]);
  const refs = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "push", "--atomic", duplicate, ...refs.map(ref => `${ref}:${ref}`)]);
  for (const [name, url] of [["first", h.destinationDirectory], ["second", duplicate]] as const) {
    await follower.exec("git", ["remote", "add", name, url]);
    await follower.exec("git", ["config", `remote.${name}.arc-state`, "off"]);
  }
  await writeFile(follower.config, "# The state moved back to code remotes.\n");
  const several = await invokeStoreMigrate([], follower.ports);
  expect(several).toMatchObject({ status: "refused", refusal: { code: "follow-refused", condition: expect.stringMatching(/first.*second/u),
    remedy: { text: expect.stringMatching(/arc store remote first <push\|read\|off>.*arc store remote second <push\|read\|off>/u) } } });
  expect(several).not.toHaveProperty("refusal.remedy.argv");
  await follower.exec("git", ["remote", "remove", "second"]);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "first",
    remedy: { argv: ["arc", "store", "remote", "first", "push"] } });
  expect((await follower.exec("git", ["config", "remote.first.arc-state"])).stdout.trim()).toBe("off");
}, 60_000);

it("takes the invoking checkout's pointer as the candidate and asks without moving unpublished data", async () => {
  const h = await followFixture(), follower = h.follower;
  const local = (await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/", "refs/arc-remotes/"])).stdout;
  const destination = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const roles = (await follower.git(["config", "--null", "--list", "--local"])).stdout;
  const unchanged = async () => {
    expect((await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/", "refs/arc-remotes/"])).stdout).toBe(local);
    expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
    expect((await follower.git(["config", "--null", "--list", "--local"])).stdout).toBe(roles);
  };
  await writeFile(follower.config, "# Checkout predating the move.\n");
  const behind = await invokeStoreMigrate([], follower.ports);
  expect(behind).toMatchObject({ status: "refused", refusal: { code: "follow-refused", remedy: { text: expect.stringMatching(/pointer|code/iu) } } });
  await unchanged();
  await writeFile(follower.config, follower.pointer);
  const question = await invokeStoreMigrate([], follower.ports);
  expect(question).toMatchObject({ status: "designation-needed", remote: "backing", choices: ["push", "read", "off"],
    remedy: { argv: ["arc", "store", "remote", "backing", "push"] } });
  await unchanged();
  expect(await readFile(follower.config, "utf8")).toBe(follower.pointer);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move", "refs/arc/tmp/follow/"])).stdout).toBe("");
}, 60_000);

it("keeps follow read failures recoverable without changing state or designation", async () => {
  const h = await followFixture(), follower = h.follower;
  const local = (await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/", "refs/arc-remotes/"])).stdout;
  const roles = (await follower.exec("git", ["config", "--get-regexp", "arc-state$"])).stdout;
  const sourceTip = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  const repaired = async () => {
    expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
    expect((await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/project/", "refs/arc/user/", "refs/arc-remotes/"])).stdout).toBe(local);
    expect((await follower.exec("git", ["config", "--get-regexp", "arc-state$"])).stdout).toBe(roles);
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/"])).stdout).toBe("");
  };
  const unreachable = (remote: string) => ({ status: "refused", refusal: { code: "store", refusal: {
    code: "unreachable", class: "recoverable", condition: expect.stringContaining(remote), remedy: { text: expect.stringContaining("retry") },
  } } });
  await rename(h.origin, h.origin + ".offline");
  try { expect(await invokeStoreMigrate([], follower.ports)).toMatchObject(unreachable("origin")); }
  finally { await rename(h.origin + ".offline", h.origin); }
  await repaired();
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(join(h.a.root, "missing.git"))}\n`);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject(unreachable("backing"));
  await writeFile(follower.config, follower.pointer);
  await repaired();
  await writeFile(follower.config, "# Candidate presence read.\n");
  await follower.exec("git", ["remote", "add", "gone", join(h.a.root, "missing.git")]);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject(unreachable("gone"));
  await follower.exec("git", ["remote", "remove", "gone"]);
  await writeFile(follower.config, follower.pointer);
  await repaired();
  for (const stage of ["source-record", "project-registry", "cat-file", "merge-base"] as const) {
    const fault = { ...follower.ports,
      exec: async (...args: Parameters<typeof follower.ports.exec>) => {
        const [command, gitArgs] = args;
        if (stage === "cat-file" && gitArgs[0] === "cat-file" && gitArgs[1] === "-e" ||
            stage === "merge-base" && gitArgs[0] === "merge-base") {
          throw makeGitProcessError({ command, args: gitArgs, exitCode: 128, stderr: "Injected object read failure" });
        }
        return follower.ports.exec(...args);
      },
      rawExec: async (...args: Parameters<NonNullable<typeof follower.ports.rawExec>>) => {
        const [gitArgs, options] = args, query = new TextDecoder().decode(options?.input);
        if (gitArgs[0] === "cat-file" && gitArgs[1] === "--batch" && (
          stage === "source-record" && query.includes(`${sourceTip}:moved.json`) ||
          stage === "project-registry" && query.includes(":identity.json") && query.includes("^{tree}"))) {
          throw makeGitProcessError({ command: "git", args: gitArgs, exitCode: 128, stderr: "Injected batch read failure" });
        }
        if (!follower.ports.rawExec) throw new Error("Native raw executor missing");
        return follower.ports.rawExec(...args);
      },
    };
    expect(await invokeStoreMigrate([], fault), stage).toMatchObject(unreachable(stage === "source-record" ? "origin" : "backing"));
    await repaired();
  }
}, 60_000);

it("follows successive layout kinds straight to the current upstream and rejects an older fork on return", async () => {
  const h = await followFixture(), follower = h.follower;
  const reader = await createRemoteMover(h, h.destinationDirectory, "backing-follower");
  const mover = await createRemoteMover(h, h.destinationDirectory, "upstream-mover");
  const upstream = join(mover.root, "upstream.git"), fork = join(mover.root, "old-fork.git");
  await mover.exec("git", ["init", "--bare", upstream]);
  await mover.exec("git", ["init", "--bare", fork]);
  await follower.git(["push", fork, "refs/arc/project/registry:refs/arc/project/registry"]);
  await mover.exec("git", ["remote", "add", "upstream", upstream]);
  await mover.exec("git", ["config", "remote.upstream.arc-state", "off"]);
  expect((await invokeStoreMigrate(["--to", "upstream"], mover.ports)).status).toBe("ok");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "follow-refused", condition: expect.stringContaining("forwarding record") } });
  await writeFile(follower.config, "# Checkout containing the second pointer change.\n");
  await follower.exec("git", ["remote", "add", "upstream", upstream]);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "upstream" });
  expect(success(await reader.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  await mover.exec("git", ["remote", "add", "returned", h.origin]);
  await mover.exec("git", ["config", "remote.returned.arc-state", "off"]);
  expect((await invokeStoreMigrate(["--to", "returned"], mover.ports)).status).toBe("ok");
  await reader.exec("git", ["remote", "add", "fork", fork]);
  const behind = await invokeStoreMigrate([], reader.ports);
  expect(behind).toMatchObject({ status: "refused", refusal: { code: "follow-refused", condition: expect.stringContaining("move's commit"),
    remedy: { text: expect.stringContaining("add the upstream") } } });
  await reader.exec("git", ["remote", "add", "returned", h.origin]);
  expect(await invokeStoreMigrate([], reader.ports)).toMatchObject({ status: "designation-needed", remote: "returned" });
}, 60_000);

it("follows one of several accepted remotes through the setting the refusal names", async () => {
  const h = await followFixture(), follower = h.follower, duplicate = join(h.a.root, "duplicate.git");
  await follower.exec("git", ["init", "--bare", duplicate]);
  const refs = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "push", "--atomic", duplicate, ...refs.map(ref => `${ref}:${ref}`)]);
  for (const [name, url] of [["first", h.destinationDirectory], ["second", duplicate]] as const) await follower.exec("git", ["remote", "add", name, url]);
  await writeFile(follower.config, "# The state moved back to code remotes.\n");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "follow-refused" } });
  const followed = (await invokeStoreRemote(["first", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(followed.status, JSON.stringify(followed)).toBe("ok");
  expect((await follower.exec("git", ["config", "remote.first.arc-state"])).stdout.trim()).toBe("push");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(["destination", "empty"] as const)("never designates or removes a code remote named backing that points at the %s repository", async target => {
  const h = await followFixture(), follower = h.follower, empty = join(h.a.root, "empty.git");
  await follower.exec("git", ["init", "--bare", empty]);
  const url = target === "destination" ? h.destinationDirectory : empty;
  for (const [name, remote] of [["first", h.destinationDirectory], ["backing", url]] as const) await follower.exec("git", ["remote", "add", name, remote]);
  // As the code remote, first takes the state into the code repository, where no store directory holds a backing remote.
  await follower.exec("git", ["config", "remote.pushdefault", "first"]);
  await writeFile(follower.config, "# The state moved back to a code remote.\n");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "first" });
  const followed = (await invokeStoreRemote(["first", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(followed.status, JSON.stringify(followed)).toBe("ok");
  expect((await follower.exec("git", ["remote", "get-url", "backing"])).stdout.trim()).toBe(url);
  expect((await follower.exec("git", ["config", "remote.first.arc-state"])).stdout.trim()).toBe("push");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
}, 60_000);
