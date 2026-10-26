/** Last-view departures retain their accepted direction through interrupted physical switches. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deletedFollowSource, missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each([
  { direction: "code-to-backing", source: "code", destination: "backing",
    steps: ["leave.copied", "leave.recorded", "layout.designation", "layout.delete", "layout.deleted", "follow.switched"] },
  { direction: "backing-to-code", source: "backing", destination: "code",
    steps: ["leave.copied", "leave.recorded", "layout.designation", "layout.rename", "layout.delete", "layout.deleted",
      "follow.switched"] },
  { direction: "backing-to-backing", source: "backing", destination: "backing", steps: ["leave.copied", "leave.recorded", "leave.switched"] },
] as const)("a source departure from $source to $destination", ({ direction, source, destination, steps }) => {
  it.each(steps)("restarts after %s using only its retained source view", async boundary => {
    const h = await missingSourceFixture(direction), follower = h.follower;
    await expect(invokeStoreMigrate(["--leave-source", "--to", h.to], { ...follower.ports, migrateStep: async step => {
      if (step === boundary) throw new Error("Interrupted source departure");
    } })).rejects.toThrow("Interrupted source departure");
    const recorded = boundary !== "leave.copied";
    if (!recorded) expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout.trim())
      .toBe("refs/arc/tmp/migrate/pending-copy/record");
    const journal = (await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout;
    expect(journal).toBe(recorded ? "refs/arc/tmp/migrate/move" : "");
    if (boundary === "leave.recorded" && source === "code") {
      for (const argv of [["--to", h.to + ".other"], ["--leave-source", "--to", h.to + ".other"], ["--to", h.to, "--trial"]]) {
        expect(await invokeStoreMigrate(argv, follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
        expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe(journal);
      }
    }
    expect(await invokeStoreMigrate(boundary === "leave.recorded" ? ["--to", h.to] : recorded ? [] : ["--leave-source", "--to", h.to], follower.ports)).toMatchObject({ status: "ok" });
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
    expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok",
      result: { layout: destination === "code" ? "default" : "separate",
        remotes: expect.arrayContaining([expect.objectContaining({ name: destination === "code" ? "origin" : "backing", role: "push" })]) } });
    const pushed = success(await follower.store.push());
    expect(pushed.states).toEqual([]);
    expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(success(await follower.store.read({ reference: h.unpublished })).content).toBe("Local departure data.\n");
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Local departure data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Local departure data.");
    expect(await readFile(h.config, "utf8")).toBe(h.pointer);
  }, 60_000);
});

it("restarts a departure interrupted at its designation from a follower holding the old remote's forwarding record", async () => {
  const h = await deletedFollowSource(), follower = h.follower;
  const moved = async (gitDir?: string) => (await follower.exec("git", [...gitDir ? [`--git-dir=${gitDir}`] : [],
    "for-each-ref", "--format=%(refname)", "refs/arc-remotes/origin/project/moved"])).stdout.trim();
  expect(await moved()).toBe("refs/arc-remotes/origin/project/moved");
  await expect(invokeStoreMigrate(["--leave-source", "--to", h.destinationDirectory], { ...follower.ports, migrateStep: async step => {
    if (step === "layout.designation") throw new Error("Interrupted source departure");
  } })).rejects.toThrow("Interrupted source departure");
  const store = join(follower.root, ".git", "arc", "store");
  expect(await moved(store)).toBe("");
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect(await moved()).toBe("");
  expect(await moved(store)).toBe("");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect(success(await follower.store.read({ reference: h.lineage })).content).toBe(h.lateEnd);
  const tip = async (gitDir: string) => (await follower.exec("git", [`--git-dir=${gitDir}`, "rev-parse", h.history])).stdout.trim();
  expect(await tip(h.destinationDirectory)).toBe(await tip(store));
  expect(success(await follower.store.push()).states).toEqual([]);
  expect(success(await follower.store.pull({ history: [h.history] })).states).toEqual([]);
}, 60_000);

it.each(["off", "read"] as const)("leaves a backing carrying %s at the changed pointer without an explicit target", async role => {
  const h = await missingSourceFixture("backing-to-backing"), follower = h.follower;
  await follower.git(["config", "remote.backing.arc-state", role]);
  expect(await invokeStoreMigrate(["--leave-source"], follower.ports)).toMatchObject({ status: "ok" });
  expect((await follower.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await follower.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  expect(success(await follower.store.push()).states).toEqual([]);
  expect(await readFile(h.config, "utf8")).toBe(h.pointer);
}, 60_000);
