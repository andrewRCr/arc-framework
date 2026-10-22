/** Explicit follow answers switch a clone only after preserving state at the new home. */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import type { PromptRenderer } from "../../src/lib/command-input/prompter.js";
import { expect, it } from "vitest";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("answers a follow with push, switching the layout and retaining unpublished local state", async () => {
  const h = await followFixture(), follower = h.follower;
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  const answer = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(answer, JSON.stringify(answer)).toMatchObject({ status: "ok", result: { layout: "separate", remotes: expect.arrayContaining([
    expect.objectContaining({ name: "origin", role: "off", repository: "code" }),
    expect.objectContaining({ name: "backing", role: "push", url: h.destinationDirectory }),
  ]) } });
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move", "refs/arc-remotes/origin/project/moved"])).stdout).toBe("");
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  const synced = success(await follower.store.push());
  expect(synced.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
  expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Unpublished follower data.");
  expect(synced.states).not.toContainEqual(expect.objectContaining({ status: "moved" }));
}, 60_000);

it("copies a prepared late publication before switching and clears it from the departed remote", async () => {
  const h = await lateFollowFixture();
  const result = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.follower.root, ports: h.follower.ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/beth/personal"])).stdout.trim()).toBe("refs/arc/user/beth/personal");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);

it("asks for the follow destination role on a terminal and executes the selected read answer", async () => {
  const h = await followFixture(), follower = h.follower;
  const destinationBefore = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let displayed = "";
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected prompt form"); };
  const renderer: PromptRenderer = { text: unexpected, confirm: unexpected, multiselect: unexpected,
    select: async (_context, question) => {
      displayed = `${question.message}\n${question.options.map(option => option.label).join("\n")}\nRecommended: ${String(question.initialValue)}`;
      const read = question.options.find(option => option.label === "read");
      if (!read) throw new Error("The read choice is missing");
      return { kind: "answered", value: read.value };
    } };
  const result = await invokeStoreMigrate([], follower.ports, renderer);
  expect(result.status, JSON.stringify(result)).toBe("ok");
  const view = (await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(view).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([
    expect.objectContaining({ name: "origin", role: "off" }), expect.objectContaining({ name: "backing", role: "read" }),
  ]) } });
  expect(displayed).toContain("backing");
  expect(displayed).toMatch(/push\nread\noff/u);
  expect(displayed).toContain("Recommended: push");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destinationBefore);
}, 60_000);

it.each([["read", "code"], ["read", "backing"], ["off", "backing"]] as const)("answers %s from %s without publishing or clearing the late source state", async (role, source) => {
  const h = await lateFollowFixture(true, source), follower = h.follower;
  const before = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const answer = (await invokeStoreRemote(["backing", role, "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(answer).toMatchObject({ status: "ok", result: { layout: "separate", remotes: expect.arrayContaining([
    ...source === "code" ? [expect.objectContaining({ name: "origin", role: "off" })] : [], expect.objectContaining({ name: "backing", role }),
  ]) } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/beth/personal"])).stdout.trim()).toBe("refs/arc/user/beth/personal");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect((await follower.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.sourceName}/project/moved`])).stdout).toBe("");
  if (source === "backing") expect((await follower.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it("takes an explicit code remote when several candidates hold the move", async () => {
  const h = await followFixture(), follower = h.follower, duplicate = join(h.a.root, "duplicate.git");
  await follower.exec("git", ["init", "--bare", duplicate]);
  const refs = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "push", "--atomic", duplicate, ...refs.map(ref => `${ref}:${ref}`)]);
  for (const [name, url] of [["first", h.destinationDirectory], ["second", duplicate]] as const) {
    await follower.exec("git", ["remote", "add", name, url]);
    await follower.exec("git", ["config", `remote.${name}.arc-state`, "off"]);
  }
  await writeFile(follower.config, "# A pointer to code remotes.\n");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "follow-refused" } });
  const original = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const followed = (await invokeStoreRemote(["second", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(followed).toMatchObject({ status: "ok", result: { layout: "separate", remotes: expect.arrayContaining([
    expect.objectContaining({ name: "origin", role: "off" }), expect.objectContaining({ name: "first", role: "off" }), expect.objectContaining({ name: "second", role: "push" }),
  ]) } });
  success(await follower.store.push());
  expect((await h.a.exec("git", [`--git-dir=${duplicate}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Unpublished follower data.");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(original);
}, 60_000);

it("follows a move back from backing into code and removes the separate directory's remote", async () => {
  const h = await followFixture(), follower = h.follower;
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  success(await follower.store.push());
  expect((await invokeStoreMigrate(["--to", "origin"], h.ports)).status).toBe("ok");
  expect(success(await follower.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved", remote: "backing" }));
  await writeFile(follower.config, "# The checkout contains the move back.\n");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "origin" });
  const followed = (await invokeStoreRemote(["origin", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(followed).toMatchObject({ status: "ok", result: { layout: "default", remotes: [expect.objectContaining({ name: "origin", role: "push", repository: "code" })] } });
  expect(success(await follower.store.pull()).states).toEqual([]);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it("finishes its recorded losing move before answering a due follow", async () => {
  const h = await switchFixture(), fork = join(h.b.root, "losing-copy.git");
  success(await h.b.store.pull());
  await h.b.exec("git", ["init", "--bare", fork]);
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await writeFile(config, "# Losing mover.\n");
  const production = createStoreCommandPorts(h.b.root), ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  await expect(invokeStoreMigrate(["--to", fork], { ...ports, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused losing copy");
  } })).rejects.toThrow("Paused losing copy");
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  expect(success(await h.b.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
  expect((await invokeStoreMigrate([], ports)).status).toBe("ok");
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect(await invokeStoreMigrate([], ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports })).result.status).toBe("ok");
}, 60_000);
