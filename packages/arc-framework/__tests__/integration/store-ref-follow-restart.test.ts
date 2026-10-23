/** Recorded follow direction and copy ownership survive interruptions at every switch boundary. */
import { rename, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { personal, provenance } from "../helpers/store/remote-move.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["follow.copied", "follow.recorded", "layout.designation", "layout.delete", "follow.switched", "follow.recopied", "follow.deleted"] as const)(
  "resumes a push follow interrupted at %s without losing writes", async step => {
    const h = await lateFollowFixture(), follower = h.follower;
    await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
      migrateStep: async current => { if (current === step) throw new Error(`Paused ${step}`); },
    } })).rejects.toThrow(`Paused ${step}`);
    const pending = RecordReferenceSchema.parse({ ...personal, key: "during-follow.md" });
    success(await follower.store.write({ action: "put", reference: pending, expected: null, content: "Written while follow paused.\n", provenance }));
    if (step === "follow.copied") {
      await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", "refs/arc/user/beth/personal"]);
      expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
      expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
        migrateStep: async current => {
          if (current === "follow.switched") expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/beth/personal"])).stdout.trim()).toBe("refs/arc/user/beth/personal");
        },
      } })).result.status).toBe("ok");
    } else {
      const record = JSON.parse((await follower.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
      expect(record).toMatchObject({ kind: "follow", answer: "push", source: { fetchUrl: h.origin }, destination: { fetchUrl: h.destinationDirectory } });
      if (step === "follow.recorded") {
        const before = (await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
        for (const argv of [["--to", h.destinationDirectory + ".other"], ["--to", h.destinationDirectory, "--trial"]]) {
          expect(await invokeStoreMigrate(argv, follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
          expect((await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
        }
      }
      if (step === "follow.recorded") expect((await invokeStoreMigrate(["--to", h.destinationDirectory], follower.ports)).status).toBe("ok");
      if (step === "follow.switched" || step === "follow.deleted") {
        expect(success(await follower.store.push()).states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
      }
      if (step === "follow.switched") {
        await rename(h.origin, h.origin + ".offline");
        try {
          expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", remedy: { argv: ["arc", "store", "migrate"] } } });
          expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
        } finally { await rename(h.origin + ".offline", h.origin); }
      }
      const resumed = step === "follow.switched"
        ? (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result
        : await invokeStoreMigrate([], follower.ports);
      expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    }
    expect(success(await follower.store.read({ reference: pending })).content).toBe("Written while follow paused.\n");
    expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  }, 60_000);

it("resumes a push follow interrupted after a copy that left nothing to push", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async current => { if (current === "follow.copied") throw new Error("Paused follow.copied"); },
  } })).rejects.toThrow("Paused follow.copied");
  const destination = async () => (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const copied = await destination();
  let recorded: string | undefined;
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async current => { if (current === "follow.recorded") recorded = await destination(); },
  } })).result.status).toBe("ok");
  expect(recorded).toBe(copied);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

async function followBackFixture() {
  const h = await followFixture(), follower = h.follower;
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  success(await follower.store.push());
  expect((await invokeStoreMigrate(["--to", "origin"], h.ports)).status).toBe("ok");
  expect(success(await follower.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved", remote: "backing" }));
  await writeFile(follower.config, "# The checkout contains the move back.\n");
  return h;
}

describe.each([
  { answer: "push", direction: "backing to backing", remote: "backing", steps: ["follow.copied", "follow.recorded", "follow.recopied", "follow.deleted"] },
  { answer: "push", direction: "backing to code", remote: "origin", steps: ["follow.copied", "follow.recorded", "layout.designation",
    "layout.rename", "layout.delete", "follow.switched", "follow.finish"] },
  { answer: "read", direction: "code to backing", remote: "backing", steps: ["follow.recorded", "layout.designation", "layout.delete", "follow.switched"] },
  { answer: "read", direction: "backing to backing", remote: "backing", steps: ["follow.recorded", "follow.switched"] },
] as const)("a $answer follow from $direction", ({ answer, direction, remote, steps }) => {
  it.each(steps)("resumes when interrupted at %s without losing writes", async step => {
    const h = direction === "backing to code" ? await followBackFixture() : await lateFollowFixture(true, direction === "code to backing" ? "code" : "backing");
    const follower = h.follower;
    await expect(invokeStoreRemote([remote, answer, "--json"], { cwd: follower.root, ports: { ...follower.ports,
      migrateStep: async current => { if (current === step) throw new Error(`Paused ${step}`); },
    } })).rejects.toThrow(`Paused ${step}`);
    const pending = RecordReferenceSchema.parse({ ...personal, key: "during-follow.md" });
    success(await follower.store.write({ action: "put", reference: pending, expected: null, content: "Written while follow paused.\n", provenance }));
    const recorded = (await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout !== "";
    expect(recorded).toBe(step !== "follow.copied");
    const resumed = recorded ? await invokeStoreMigrate([], follower.ports)
      : (await invokeStoreRemote([remote, answer, "--json"], { cwd: follower.root, ports: follower.ports })).result;
    expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    expect(success(await follower.store.read({ reference: pending })).content).toBe("Written while follow paused.\n");
    expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
    expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok",
      result: { layout: direction === "backing to code" ? "default" : "separate", remotes: expect.arrayContaining([expect.objectContaining({ name: remote, role: answer })]) } });
    if (answer === "push") expect(success(await follower.store.pull()).states).toEqual([]);
  }, 60_000);
});

it("returns a finished layout move's report before the follow that became due beside it asks", async () => {
  const h = await followFixture(async fixture => {
    await expect(invokeStoreRemote(["origin", "read", "--json"], { cwd: fixture.b.root, ports: { ...fixture.b.ports,
      migrateStep: async step => { if (step === "layout.rename") throw new Error("Paused layout move"); },
    } })).rejects.toThrow("Paused layout move");
  });
  const follower = h.follower;
  const finished = await invokeStoreMigrate([], follower.ports);
  expect(finished, JSON.stringify(finished)).toMatchObject({ status: "ok", result: { move: "layout" } });
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok",
    result: { layout: "separate", remotes: [expect.objectContaining({ name: "origin", role: "read" })] } });
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
}, 60_000);
