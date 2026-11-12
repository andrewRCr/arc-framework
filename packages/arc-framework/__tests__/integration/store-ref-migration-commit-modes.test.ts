/** Public remote migrations commit isolated code-repository merges without taking the held layout lock. */
import { expect, it } from "vitest";
import { switchFixture, provenance, personal, capturePeerState } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

it("merges temporary state in the code repository while another holder retains layout serialization", async () => {
  const h = await switchFixture("backing", "code");
  success(await h.b.store.pull());
  const source = RecordReferenceSchema.parse({ ...personal, key: "source.md" });
  const destination = RecordReferenceSchema.parse({ ...personal, key: "destination.md" });
  success(await h.b.store.write({ action: "put", reference: destination, expected: null, content: "Destination state.\n", provenance }));
  const before = await capturePeerState(h);
  await h.b.git(["push", "--atomic", "--", h.destinationDirectory, ...[...before].map(([ref, tip]) => `${tip}:${ref}`)]);
  success(await h.store.write({ action: "put", reference: source, expected: null, content: "Source state.\n", provenance }));
  success(await h.store.push());
  let release = await h.ports.lock("layout"), copied = false;
  try {
    const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports,
      lock: (name, wait) => h.ports.lock(name, name === "layout" ? 40 : wait), migrateStep: async step => {
        if (step !== "remote.copied") return;
        const tip = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
        for (const content of ["Source state.", "Destination state."])
          expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", content, "refs/arc/user/andrew/personal"])).stdout).toContain(content);
        expect((await h.a.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/tmp/migrate/remote/"])).stdout.split("\n")).toContain(tip);
        expect((await h.a.exec("git", ["rev-list", "--parents", "-1", tip])).stdout.trim().split(" ")).toHaveLength(3);
        copied = true;
        await release(); release = async () => {};
      } });
    expect(moved.status, JSON.stringify(moved)).toBe("ok");
    expect(copied).toBe(true);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
    success(await h.store.pull());
    const registryMessage = (await h.a.exec("git", ["-C", h.destinationDirectory, "show", "-s", "--format=%B", "refs/arc/project/registry"])).stdout;
    const registryBatch = /^Arc-Batch: (.+)$/mu.exec(registryMessage)?.[1];
    const registryReceipt = /^Arc-Creation-Receipt: (.+)$/mu.exec(registryMessage)?.[1];
    expect(registryReceipt && JSON.parse(registryReceipt)).toEqual({ schemaVersion: 1, batchId: registryBatch, createdOwners: [] });
    expect(success(await h.store.read({ reference: source })).content).toBe("Source state.\n");
    expect(success(await h.store.read({ reference: destination })).content).toBe("Destination state.\n");
  } finally { await release(); }
}, 45_000);
