/** Copy refusal remedies retain the public operation that can restart the failed attempt. */
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("restarts a first remote copy with its target after a definitive refusal removed the record", async () => {
  const h = await switchFixture(), hook = join(h.destinationDirectory, "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  const refused = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused",
    remedy: { argv: ["arc", "store", "migrate", "--to", h.to] } } } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await rm(hook);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/registry"])).stdout.trim()).toBe("refs/arc/project/registry");
}, 60_000);

it.each(["push", "lease-read"] as const)("retries the source departure after a failed %s while its fetch URL remains healthy", async failed => {
  const h = await missingSourceFixture("backing-to-code"), follower = h.follower;
  const missing = h.destinationDirectory + ".missing", hook = join(h.destinationDirectory, "hooks", "pre-receive");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/personal"])).stdout).not.toBe("");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", "refs/arc/user/andrew/personal"]);
  if (failed === "push") await follower.exec("git", ["config", "remote.origin.pushurl", missing]);
  else { await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755); }
  const ports = { ...follower.ports, exec: async (...args: Parameters<typeof follower.ports.exec>) => {
    const [command, gitArgs, options] = args;
    return failed === "lease-read" && gitArgs[0] === "ls-remote" && gitArgs.includes("--refs") && gitArgs.includes(h.destinationDirectory)
      ? follower.ports.exec(command, gitArgs.map(arg => arg === h.destinationDirectory ? missing : arg), options)
      : follower.ports.exec(...args);
  } };
  const refused = await invokeStoreMigrate(["--leave-source", "--to", "origin"], ports);
  expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable",
    remedy: { argv: ["arc", "store", "migrate", "--leave-source", "--to", "origin"] } } } });
  const retained = (await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout.trim().split("\n").filter(Boolean);
  expect(retained).toEqual(failed === "push" ? ["refs/arc/tmp/migrate/pending-copy/record", "refs/arc/tmp/migrate/pending-copy/tips/user/andrew/personal"] : []);
  expect(success(await follower.store.read({ reference: h.unpublished })).content).toBe("Local departure data.\n");
  if (failed === "push") await follower.exec("git", ["config", "--unset", "remote.origin.pushurl"]);
  else await rm(hook);
  const retried = await invokeStoreMigrate(["--leave-source", "--to", "origin"], follower.ports);
  expect(retried.status, JSON.stringify(retried)).toBe("ok");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect(success(await follower.store.push()).states).toEqual([]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Local departure data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Local departure data.");
}, 60_000);

it("retries a backing repoint through its setting after the receiver refuses its unrecorded copy", async () => {
  const h = await missingSourceFixture("backing-to-backing"), follower = h.follower;
  const hook = join(h.destinationDirectory, "hooks", "pre-receive");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/personal"])).stdout).not.toBe("");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", "refs/arc/user/andrew/personal"]);
  await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  const config = (await follower.git(["config", "--null", "--list", "--local"])).stdout;
  const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused",
    remedy: { argv: ["arc", "store", "remote", "backing", "push"] } } } });
  expect((await follower.git(["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await rm(hook);
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect(success(await follower.store.push()).states).toEqual([]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Local departure data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Local departure data.");
}, 60_000);


it("retries an unrecorded follow answer after its copy push loses access without claiming a record exists", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  let hidden = false;
  try {
    const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
      migrateStep: async step => {
        if (step === "follow.copy" && !hidden) { await rename(h.destinationDirectory, h.destinationDirectory + ".offline"); hidden = true; }
      },
    } })).result;
    expect.soft(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable",
      remedy: { argv: ["arc", "store", "remote", "backing", "push"], text: expect.not.stringContaining("recorded copy") } } } });
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout.trim().split("\n"))
      .toEqual(["refs/arc/tmp/migrate/pending-copy/record", "refs/arc/tmp/migrate/pending-copy/tips/user/beth/personal"]);
  } finally { if (hidden) await rename(h.destinationDirectory + ".offline", h.destinationDirectory); }
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);


it("retries an unrecorded follow after repairing only its named destination push URL", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  await writeFile(follower.config, "# Follow a named code remote.\n");
  await follower.exec("git", ["remote", "add", "next", h.destinationDirectory]);
  await follower.exec("git", ["config", "remote.next.pushurl", h.destinationDirectory + ".missing"]);
  const answer = () => invokeStoreRemote(["next", "push", "--json"], { cwd: follower.root, ports: follower.ports });
  expect((await answer()).result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable" } } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toContain("pending-copy/record");
  await follower.exec("git", ["config", "--unset", "remote.next.pushurl"]);
  const retried = (await answer()).result;
  expect(retried.status, JSON.stringify(retried)).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toBe("");
}, 60_000);

it("refuses a changed departure destination while retaining the original interrupted copy", async () => {
  const h = await missingSourceFixture("backing-to-code"), follower = h.follower;
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", "refs/arc/user/andrew/personal"]);
  await follower.exec("git", ["config", "remote.origin.pushurl", h.destinationDirectory + ".missing"]);
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], follower.ports))
    .toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable" } } });
  const retained = (await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout;
  expect(retained).toContain("pending-copy/record");
  const other = join(follower.root, "other-destination.git");
  await follower.exec("git", ["clone", "--bare", h.destinationDirectory, other]);
  await follower.exec("git", [`--git-dir=${other}`, "fetch", h.destinationDirectory, "+refs/arc/*:refs/arc/*"]);
  const readOther = () => follower.exec("git", [`--git-dir=${other}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  const before = (await readOther()).stdout;
  await follower.exec("git", ["remote", "set-url", "origin", other]);
  await follower.exec("git", ["config", "--unset", "remote.origin.pushurl"]);
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], follower.ports))
    .toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("another migration direction") } });
  expect((await readOther()).stdout).toBe(before);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toBe(retained);
  await follower.exec("git", ["remote", "set-url", "origin", h.destinationDirectory]);
  expect((await invokeStoreMigrate(["--leave-source", "--to", "origin"], follower.ports)).status).toBe("ok");
}, 60_000);
