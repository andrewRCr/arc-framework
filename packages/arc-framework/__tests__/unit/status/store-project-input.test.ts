/** Combined project acquisition retains completeness instead of turning failed reads into empty work. */
import { expect, it } from "vitest";
import type { Store } from "../../../src/lib/store/contract.js";
import { readStoreProjectViewInput } from "../../../src/lib/status/store-project-input.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { composeProjectReadinessViewResult } from "../../../src/lib/status/project-view.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";

it("returns an unreadable lifecycle inventory as a refusal with its remedy", async () => {
  const h = createLifecycleHarness();
  const store = Object.create(h.store) as Store;
  store.list = async input => input.kind === "work-item/meta"
    ? { status: "ok", result: { status: "unreadable", condition: "Lifecycle index unavailable.", remedy: { text: "Restore the lifecycle index and retry." } } }
    : h.store.list(input);

  expect(await readStoreProjectViewInput({ store, reviewAfterDays: 14 })).toEqual({ status: "refused", refusal: {
    code: "listing-unreadable", condition: "Lifecycle index unavailable.", remedy: { text: "Restore the lifecycle index and retry." },
  } });
});

it("discloses a malformed meta as an omitted record instead of absent work", async () => {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("work-item/meta");
  const written = lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null,
    content: JSON.stringify(parseMetaRecord(makeMetaFixture(reference.owner.name))), placement: { kind: "active" }, provenance: testProvenance }));
  await fixture.plant(written.reference, "malformed");

  const outcome = await readStoreProjectViewInput({ store: fixture.store, reviewAfterDays: 14 });
  if (outcome.status === "refused") throw new Error(outcome.refusal.condition);
  expect(outcome.result.records).toEqual([]);
  expect(outcome.result.sourceWarnings).toMatchObject([{ code: "listing-diagnostic" }]);
  expect(outcome.result.sourceWarnings[0]?.rendered).toContain(reference.owner.name);
  expect(outcome.result.sourceWarnings[0]?.rendered).toMatch(/malformed.*omits.*repair/iu);
});

it("discloses a conflicted meta and its conflict references as an omitted record", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("disputed");
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  const incoming = lifecycleSuccess(await writer.read({ reference: meta.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(local, { content: local.content.replaceAll("test-user", "local-owner") }),
    provenance: { verb: "update", lifecycleAction: "update" } }));
  lifecycleSuccess(await writer.write({ ...recordPut(incoming, { content: incoming.content.replaceAll("test-user", "remote-owner") }),
    provenance: { verb: "update", lifecycleAction: "update" } }));
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(disputed.conflicts).toHaveLength(1);

  const outcome = await readStoreProjectViewInput({ store: h.store, reviewAfterDays: 14 });
  if (outcome.status === "refused") throw new Error(outcome.refusal.condition);
  expect(outcome.result.records).toEqual([]);
  expect(outcome.result.sourceWarnings).toMatchObject([{ code: "listing-diagnostic" }]);
  const warning = outcome.result.sourceWarnings[0]?.rendered ?? "";
  expect(warning).toContain(JSON.stringify(disputed.conflicts[0]));
  expect(warning).toMatch(/conflict.*omits.*resolve/iu);
});

it("composes placement-based In Flight and paused rows from the same selected entries", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("active");
  await h.seedMeta("planning", { state: "Planning", currentWorkflow: "draft-design" });
  await h.seedMeta("ready", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  const paused = await h.seedMeta("paused");
  const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-10-01T12:00:00.000Z", reason: "Waiting" });
  lifecycleSuccess(await h.store.write({ ...recordPut(paused, { content: writeMetaPause(paused.content, pause) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const before = lifecycleSuccess(await h.store.version());

  const outcome = await readStoreProjectViewInput({ store: h.store, reviewAfterDays: 14,
    now: new Date("2026-10-21T12:00:00.000Z") });
  if (outcome.status === "refused") throw new Error(outcome.refusal.condition);
  const input = outcome.result;
  const result = composeProjectReadinessViewResult(input);
  const inFlight = result.markdown.split("## In Flight")[1]?.split("## Ready")[0] ?? "";
  expect(inFlight).toContain("active");
  expect(inFlight).toContain("planning");
  expect(inFlight).not.toContain("paused");
  expect(inFlight).not.toContain("ready");
  expect(result.markdown.split("## Paused")[1]).toContain("review-due");
  expect(result.warnings).toEqual([]);
  expect(input).not.toHaveProperty("renderedRef");
  expect(input).not.toHaveProperty("indeterminate");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("renders an absent lifecycle inventory as empty input without freshness or oracle fields", async () => {
  const h = createLifecycleHarness();
  const result = await readStoreProjectViewInput({ store: h.store, reviewAfterDays: 14 });
  expect(result).toEqual({ status: "ok", result: { title: "Roadmap: Project Status", records: [],
    dependencyResolutions: new Map(), pausedMarks: new Map(), sourceWarnings: [] } });
});

it("retains a refused lifecycle read's status fields", async () => {
  const h = createLifecycleHarness();
  const store = Object.create(h.store) as Store;
  store.list = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "Lifecycle namespace unavailable.", remedy: { text: "Repair the lifecycle namespace and retry." } } });
  expect(await readStoreProjectViewInput({ store, reviewAfterDays: 14 })).toEqual({ status: "refused", refusal: {
    code: "namespace-corrupt", condition: "Lifecycle namespace unavailable.", remedy: { text: "Repair the lifecycle namespace and retry." },
  } });
});
