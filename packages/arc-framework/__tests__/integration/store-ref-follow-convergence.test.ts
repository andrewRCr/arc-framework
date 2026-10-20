/** Independent clones converge after forwarding, clearing, and moves overtaking one another. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { switchFixture, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["before", "after", "during-recopy"] as const)("follows %s the mover clears the old remote without diverging at the new home", async timing => {
  const h = await switchFixture();
  success(await h.b.store.pull());
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, "# Follower checkout before pointer update.\n");
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const store = createRefStore(ports);
  const unpublished = RecordReferenceSchema.parse({ ...personal, key: "follower-only.md" });
  success(await store.write({ action: "put", reference: unpublished, expected: null, content: "Follower publication survives re-copy.\n", provenance }));
  const follow = async () => {
    expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports })).result.status).toBe("ok");
    success(await store.push());
  };
  let forwardedRegistry = "";
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (timing === "during-recopy" && step === "remote.recopy") await follow();
    if (step !== "remote.forwarded") return;
    forwardedRegistry = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
    const pulled = success(await store.pull());
    expect(pulled.states).toContainEqual(expect.objectContaining({ status: "moved" }));
    await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
    if (timing === "before") await follow();
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  const registryHistory = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "log", "--format=%H", "refs/arc/project/registry"])).stdout.trim().split("\n");
  expect(registryHistory).toContain(forwardedRegistry);
  if (timing === "after") await follow();
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--name-only", "refs/arc/user/andrew/personal"])).stdout.split("\n")).toContain("andrew/follower-only.md");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Follower publication survives re-copy.", "refs/arc/user/andrew/personal"])).stdout).toContain("Follower publication survives re-copy.");
  const pulled = success(await store.pull());
  expect(pulled.states).toEqual([]);
  expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
  expect(pulled.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
  expect(success(await store.read({ reference: personal })).content).toBe("Shared state.\n");
  success(await h.store.push());
  success(await store.pull());
  expect(success(await store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect((await h.b.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);
