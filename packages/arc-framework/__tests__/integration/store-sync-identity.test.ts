/** Actual identity-ref push outcomes through the independent Store sync leg. */
import { describe, expect, it } from "vitest";
import { syncFixture, syncPut, syncErrandRef, syncErrand, syncRecord } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { MAX_RECONCILE_ATTEMPTS } from "../../src/lib/git/ref-tree.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

describe("Store identity publication", () => {
  it("retains the legacy pushed outcome for repeated unchanged identity publication", async () => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const before = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
    for (let repetition = 0; repetition < 2; repetition++) {
      expect(success(await h.a.store.sync()).publishes[1]).toEqual({ status: "pushed", families: ["work-item", "claims"] });
      expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(before);
    }
  });

  it("unions distinct real local and remote records into a reconciled publication", async () => {
    const h = await syncFixture();
    h.a.ports.remote = async () => null;
    success(await h.a.store.write(syncPut()));
    h.a.ports.remote = async () => "origin";
    const other = syncRecord();
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
    success(await h.b.store.write({ ...syncPut(), reference, content: serializeTransientIdentityRecord({ ...other, slug: reference.owner.name, branch: "chore/beta" }) }));
    expect(success(await h.a.store.sync()).publishes[1]).toEqual({ status: "reconciled", families: ["work-item", "claims"] });
    expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.split("\n").sort()).toEqual(["alpha", "beta"]);
  });

  it("maps same-record divergence to an identity conflict without publishing its local copy", async () => {
    const h = await syncFixture();
    h.a.ports.remote = async () => null;
    success(await h.a.store.write(syncPut("local")));
    h.a.ports.remote = async () => "origin";
    success(await h.b.store.write(syncPut("remote")));
    const before = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
    expect(success(await h.a.store.sync()).publishes[1]).toMatchObject({ status: "conflict", families: ["work-item", "claims"], condition: expect.stringContaining("alpha"), remedy: { text: expect.stringContaining("repair") } });
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(before);
    expect(success(await h.a.store.read({ reference: syncErrand })).content).toContain("local");
  });

  it("reports actual exhausted remote races with attempt count and injected-clock elapsed time", async () => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const base = h.a.ports.exec;
    let attempts = 0;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "push" && args.includes(syncErrandRef)) {
        attempts++;
        await h.b.exec("git", ["fetch", "origin", `+${syncErrandRef}:${syncErrandRef}`]);
        const tip = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
        const blob = await hashBlob(h.b.execInput, serializeTransientIdentityRecord(syncRecord()));
        await writeTreeCommit({ identity: "andrew", exec: h.b.exec, execInput: h.b.execInput }, new Map([["alpha", blob]]), `Remote race ${attempts}`, [tip], tip);
        await h.b.exec("git", ["push", "origin", syncErrandRef]);
      }
      return base(command, args, options);
    };
    let ticks = 0;
    h.a.ports.clock = () => new Date(ticks++ * 125);
    expect(success(await h.a.store.sync()).publishes[1]).toMatchObject({ status: "failed", families: ["work-item", "claims"], failure: {
      code: "retries-exhausted", class: "recoverable", retryCount: MAX_RECONCILE_ATTEMPTS + 1, waitedMs: 125,
    } });
    expect(attempts).toBe(MAX_RECONCILE_ATTEMPTS + 1);
  });

  it("throws a missing-Git identity publish with its original cause", async () => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const original = new GitProcessError({ kind: "spawn-failure", command: "git", args: ["push", "origin", syncErrandRef], cause: new Error("Git executable missing") });
    const base = h.a.ports.exec;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "push" && args.includes(syncErrandRef)) throw original;
      return base(command, args, options);
    };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: original });
  });
});
