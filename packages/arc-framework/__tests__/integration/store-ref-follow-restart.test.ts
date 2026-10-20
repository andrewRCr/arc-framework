/** Recorded follow direction and copy ownership survive interruptions at every switch boundary. */
import { rename } from "node:fs/promises";
import { expect, it } from "vitest";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { personal, provenance } from "../helpers/store/remote-move.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["follow.copied", "follow.recorded", "follow.switch", "layout.rename", "layout.designation", "layout.delete",
  "follow.switched", "follow.recopied", "follow.delete", "follow.deleted", "follow.finish"] as const)(
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
      if (["follow.switched", "follow.recopied", "follow.delete", "follow.deleted", "follow.finish"].includes(step)) {
        expect(success(await follower.store.push()).states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
      }
      if (step === "follow.switched") {
        await rename(h.origin, h.origin + ".offline");
        try {
          expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", remedy: { argv: ["arc", "store", "migrate"] } } });
          expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
        } finally { await rename(h.origin + ".offline", h.origin); }
      }
      const resumed = await invokeStoreMigrate([], follower.ports);
      expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    }
    expect(success(await follower.store.read({ reference: pending })).content).toBe("Written while follow paused.\n");
    expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Prepared late publication.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared late publication.");
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  }, 60_000);
