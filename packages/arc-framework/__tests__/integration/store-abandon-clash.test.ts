/** Abandonment treats ambiguous dependent names as coordination evidence. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { recordKey } from "../helpers/store/model.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

it.each([false, true])("abandons while an Integrating edge is held, coordinating only a matching candidate, related=%s", async related => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const retiring = await h.seedMeta("retiring", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  const target = related ? retiring : await h.seedMeta("target");
  const other = await h.seedMeta("other");
  const edge = related ? "former" : "target";
  if (related) {
    const raw = h.store.state.records.get(recordKey(target.reference));
    if (raw === undefined) throw new Error("Expected the retiring holder");
    raw.formerSlugs.push(edge);
  }
  const dependent = await h.seedMeta("dependent", { state: "Integrating", currentWorkflow: "integrate-work-unit", dependsOn: [edge] });
  if (related) {
    const raw = h.store.state.records.get(recordKey(other.reference));
    if (raw === undefined) throw new Error("Expected the competing holder");
    raw.formerSlugs.push(edge);
  }
  const store = related ? h.store : createClashDouble(h.store, { slug: edge, holders: [target.reference, other.reference] });
  const beforeDependent = lifecycleSuccess(await h.store.read({ reference: dependent.reference }));
  const beforeOther = lifecycleSuccess(await h.store.read({ reference: other.reference }));
  const result = await repairCli(f, ["abandon", "retiring", "--yes"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const text = result.stdout + result.stderr;
  if (related) expect(text).toContain("Integrating work unit dependent depends on retiring");
  else expect(text).not.toContain("Coordination: Integrating work unit dependent");
  expect(await h.store.read({ reference: retiring.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(beforeDependent);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(beforeOther);
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](retiring.reference.owner) })).fields)
    .toMatchObject({ kind: "abandon" });
}, 60_000);

it("refuses an unavailable dependency lookup before mutation, then abandons after repair", async () => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const retiring = await h.seedMeta("retiring", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  await h.seedMeta("target");
  const dependent = await h.seedMeta("dependent", { state: "Integrating", currentWorkflow: "integrate-work-unit", dependsOn: ["target"] });
  const lookup = h.store.lookup.bind(h.store);
  let locked = true;
  h.store.lookup = input => locked && input.kind === "slug" && input.slug === "target"
    ? Promise.resolve({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "dependency-lookup",
      condition: "Dependency lookup is locked.", remedy: { text: "Release the dependency lookup lock and retry." } } }) : lookup(input);
  const refused = await repairCli(f, ["abandon", "retiring", "--yes"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("Release the dependency lookup lock and retry.");
  expect(lifecycleSuccess(await h.store.read({ reference: retiring.reference }))).toEqual(retiring);
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
  locked = false;
  const retried = await repairCli(f, ["abandon", "retiring", "--yes"], { store: h.store });
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  expect(await h.store.read({ reference: retiring.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: dependent.reference }))).toEqual(dependent);
}, 60_000);
