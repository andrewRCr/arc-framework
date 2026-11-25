/** Start and materialize retain lookup ambiguity through their own reporting paths. */
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
it.each(["start", "materialize", "graduation"] as const)("%s reports both clashed holders before claiming a checkout", async path => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: path === "materialize" ? "draft-design" : null },
    path === "materialize" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  const other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference],
    ...(path === "graduation" ? { mode: "mid-verb" as const } : {}) });
  const result = await repairCli(f, [path === "materialize" ? path : "start", "example", "--here"], { store });
  expect(result.exitCode).toBe(1);
  const text = result.stdout + result.stderr;
  expect(text).toContain("ambiguous-match"); expect(text).toContain("work unit `example`");
  if (primary.reference.owner.type === "person" || other.reference.owner.type === "person") throw new Error("Expected work-item identities");
  expect(text).toContain(primary.reference.owner.uid); expect(text).toContain(other.reference.owner.uid);
  expect(text).toContain(`arc rename ${primary.reference.owner.uid} <new-slug>`);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "absent" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
}, 60_000);
