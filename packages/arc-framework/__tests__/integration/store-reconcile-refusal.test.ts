/** Reconcile rejects another clashed operand without losing evidence or changing the checkout owner. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
it.each([false, true])("reports the clashed operand with its complete refusal, json=%s", async json => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const primary = await h.seedMeta("example"), other = await h.seedMeta("other"), caller = await h.seedMeta("caller");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference] });
  const expected = await store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
  if (expected.status !== "refused") throw new Error("Expected a fixture clash");
  await writeWorktreeOwnershipMarker(f.cwd, { createdByArc: true,
    createdFor: boundWorkUnitSubject(caller), spawningIdentity: "test-user" });
  const result = await repairCli(f, ["wu", "reconcile", "example", "--apply", ...(json ? ["--json"] : [])], { store });
  expect(result.exitCode).toBe(1);
  if (json) expect(result.result).toMatchObject({ status: "conflict", slug: "example", refusal: expected.refusal });
  else {
    const text = result.stdout + result.stderr;
    expect(text).toContain("ambiguous-match"); expect(text).toContain("work unit `example`");
    if (primary.reference.owner.type === "person" || other.reference.owner.type === "person") throw new Error("Expected work-item identities");
    expect(text).toContain(primary.reference.owner.uid); expect(text).toContain(other.reference.owner.uid);
    expect(text).toContain(`arc rename ${primary.reference.owner.uid} <new-slug>`);
    expect(text).toContain(`arc rename ${other.reference.owner.uid} <new-slug>`);
  }
  for (const record of [primary, other, caller]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
}, 60_000);
