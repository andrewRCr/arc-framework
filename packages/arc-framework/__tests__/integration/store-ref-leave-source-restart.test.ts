/** Last-view departures retain their accepted direction through interrupted physical switches. */
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

const cases = [
  { direction: "code-to-backing", boundary: "leave.copied", recorded: false },
  { direction: "code-to-backing", boundary: "leave.recorded", recorded: true },
  { direction: "code-to-backing", boundary: "layout.designation", recorded: true },
  { direction: "backing-to-code", boundary: "layout.designation", recorded: true },
  { direction: "backing-to-backing", boundary: "leave.switched", recorded: true },
] as const;

it.each(cases)("restarts $direction after $boundary using only its retained source view", async ({ direction, boundary, recorded }) => {
  const h = await missingSourceFixture(direction), follower = h.follower;
  await expect(invokeStoreMigrate(["--leave-source", "--to", h.to], { ...follower.ports, migrateStep: async step => {
    if (step === boundary) throw new Error("Interrupted source departure");
  } })).rejects.toThrow("Interrupted source departure");
  const journal = (await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout;
  expect(journal).toBe(recorded ? "refs/arc/tmp/migrate/move" : "");
  if (boundary === "leave.recorded") {
    for (const argv of [["--to", h.to + ".other"], ["--leave-source", "--to", h.to + ".other"], ["--to", h.to, "--trial"]]) {
      expect(await invokeStoreMigrate(argv, follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
      expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe(journal);
    }
  }
  expect(await invokeStoreMigrate(boundary === "leave.recorded" ? ["--to", h.to] : recorded ? [] : ["--leave-source", "--to", h.to], follower.ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  const pushed = success(await follower.store.push());
  expect(pushed.states).toEqual([]);
  expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
  expect(success(await follower.store.read({ reference: h.unpublished })).content).toBe("Local departure data.\n");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Local departure data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Local departure data.");
  expect(await readFile(h.config, "utf8")).toBe(h.pointer);
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
