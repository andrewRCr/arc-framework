/** Registered reconciliation carries held dependency facts through human and machine output. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createDecomposeHarness } from "../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";

it.each([false, true])("reports a held edge with both typed holders and the repair, json=%s", async json => {
  const f = await repairCliFixture(), h = createDecomposeHarness();
  const target = await h.seedMeta("target");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["target"] });
  const cohort = await h.seedCohort("target");
  await writeWorktreeOwnershipMarker(f.cwd, { createdByArc: true,
    createdFor: boundWorkUnitSubject(dependent), spawningIdentity: "test-user" });
  const result = await repairCli(f, ["wu", "reconcile", "dependent", ...(json ? ["--json"] : [])], { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  if (json) expect(result.result).toMatchObject({ status: "pending", dependency: { after: ["target"], live: [], held: [{
    edge: "target", name: "target", cause: "tie", candidates: expect.arrayContaining([target.reference, cohort.reference]),
    tie: { liveness: "live", name: "current" }, repair: { text: expect.stringContaining("arc rename"), argv: ["arc", "status", "--json"] },
  }] } });
  else {
    const text = result.stdout + result.stderr;
    expect(text).toContain("Held dependency `target`");
    expect(text).toContain("work unit `target`"); expect(text).toContain("cohort `target`");
    if (target.reference.owner.type === "person" || cohort.reference.owner.type === "person") throw new Error("Expected named holder identities");
    expect(text).toContain(target.reference.owner.uid); expect(text).toContain(cohort.reference.owner.uid);
    expect(text).toContain(`arc rename ${cohort.reference.owner.uid} <new-slug>`);
  }
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
}, 60_000);
