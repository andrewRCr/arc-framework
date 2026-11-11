/** Claim-only layout changes remain retryable without requiring any new store delta. */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const beta = await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" })),
    makeMetaFixture("beta", { owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "shared.txt"), "Alpha's unstamped bytes.\n");
  await seed(h.f, recordReferences["work-item/companion"](beta.reference.owner, "shared.txt"), "Beta's unstamped bytes.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  const claim = (primary: typeof beta) => writeWorktreeMarker(h.f.root, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: new Date(0).toISOString(), createdFor: boundWorkUnitSubject(primary) });
  const disk = async () => {
    const read = await readProjectionIndex(h.projected.location, true, { groups: "all" });
    if (read.kind !== "index") throw new Error("Missing reprojection index");
    return read.index;
  };
  const cycle = async () => { expect(await startProjection(command)).toMatchObject({ kind: "ready" }); await endProjection(command); };
  return { ...h, beta, claim, disk, cycle, version: success(await h.f.store.version()), command };
}

it("journals a claim-only change and finishes its blocked arrival without another store write", async () => {
  const h = await fixture();
  await h.claim(h.beta);
  await h.cycle();
  expect(await h.disk()).toMatchObject({ reprojectionPending: true, projectedUnder: { claim: "alpha" } });
  for (let retry = 0; retry < 3; retry += 1) await h.cycle();
  expect(await readFile(join(h.f.root, ".arc/active/current/shared.txt"), "utf8")).toBe("Beta's unstamped bytes.\n");
  const final = await h.disk();
  expect(final.projectedUnder.claim).toBe("beta");
  expect(final.reprojectionPending).toBeUndefined();
  expect(success(await h.f.store.version())).toBe(h.version);
});

it("retries a partial A to B to A claim cycle even when the retained tuple compares equal", async () => {
  const h = await fixture();
  await h.claim(h.beta);
  await h.cycle();
  expect(await h.disk()).toMatchObject({ reprojectionPending: true, projectedUnder: { claim: "alpha" } });
  await h.claim(h.primary);
  for (let retry = 0; retry < 3; retry += 1) await h.cycle();
  expect(await readFile(join(h.f.root, ".arc/active/current/shared.txt"), "utf8")).toBe("Alpha's unstamped bytes.\n");
  expect(await readFile(join(h.f.root, ".arc/active/in-flight/beta/shared.txt"), "utf8")).toBe("Beta's unstamped bytes.\n");
  const final = await h.disk();
  expect(final.projectedUnder.claim).toBe("alpha");
  expect(final.reprojectionPending).toBeUndefined();
  expect(success(await h.f.store.version())).toBe(h.version);
});

it("journals before an interrupted layout mutation and recovers toward a returned claim", async () => {
  const h = await fixture();
  await h.claim(h.beta);
  const native = createProjectionEnginePorts(h.f.root);
  await expect(startProjection({ ...h.command, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "interrupted-reprojection" }),
    hooks: { afterMove: async () => {
      expect(await h.disk()).toMatchObject({ reprojectionPending: true, projectedUnder: { claim: "alpha" } });
      throw new Error("interrupted layout mutation");
    } },
  }) })).rejects.toThrow("interrupted layout mutation");
  expect(await h.disk()).toMatchObject({ reprojectionPending: true, projectedUnder: { claim: "alpha" } });
  await h.claim(h.primary);
  for (let retry = 0; retry < 3; retry += 1) await h.cycle();
  expect(await readFile(join(h.f.root, ".arc/active/current/shared.txt"), "utf8")).toBe("Alpha's unstamped bytes.\n");
  expect(await readFile(join(h.f.root, ".arc/active/current/meta-alpha.md"), "utf8")).toContain("alpha");
  const final = await h.disk();
  expect(final.projectedUnder.claim).toBe("alpha");
  expect(final.reprojectionPending).toBeUndefined();
  expect(success(await h.f.store.version())).toBe(h.version);
});
