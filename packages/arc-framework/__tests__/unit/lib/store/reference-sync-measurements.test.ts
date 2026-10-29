/** Publication outcomes expose retries and injected elapsed time at every settling path. */
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences, type RecordVersion } from "../../../../src/lib/store/index.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { success } from "../../../helpers/store/suite-tools.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "11111111-1111-4111-8111-111111111111" });
const reference = recordReferences["work-item/meta"](owner);
const provenance = { verb: "edit", lifecycleAction: "update" };
const input = { action: "put" as const, reference, expected: null, content: "record", placement: { kind: "active" as const }, provenance };

function setup() {
  let clock = 0;
  const remote = createMemoryRemote();
  const environment = { identity: "test-user", actor: "local", now: () => clock, wait: (ms: number) => { clock += ms; } };
  const store = new ReferenceBackend({ environment, publication: { remote, base: new Map() } });
  const writer = new ReferenceBackend({ state: remote.state, environment: { ...environment, actor: "remote" } });
  return { remote, store, writer };
}

describe("reference publication measurements", () => {
  it.each(["noop", "pushed", "reconciled"] as const)("measures a first-attempt %s", async (status) => {
    const h = setup();
    if (status === "pushed") success(await h.store.write(input));
    if (status === "reconciled") success(await h.writer.write(input));
    const result = success(await h.store.push());
    expect(result.pulls).toEqual([]);
    expect(result.publishes[0]).toMatchObject({ status, retryCount: 0, waitedMs: 0 });
  });
  it.each(["down", "refusing"] as const)("measures an immediate %s failure", async (condition) => {
    const h = setup();
    h.remote.condition = condition;
    expect(success(await h.store.push()).publishes[0]).toMatchObject({
      status: "failed", retryCount: 0, waitedMs: 0,
      failure: { code: condition === "down" ? "unreachable" : "refused" },
    });
  });
  it("counts only the retry preceding a successful publish", async () => {
    const h = setup();
    success(await h.store.write(input));
    let attempts = 0;
    h.remote.beforePublish = async () => {
      if (attempts++ !== 0) return;
      const counter = recordReferences["project-registry/counter"](OwnerIdentitySchema.parse({ type: "project", name: "project" }), "race");
      success(await h.writer.write({ action: "put", reference: counter, expected: null, content: '{"value":1}', provenance }));
    };
    expect(success(await h.store.push()).publishes[0]).toMatchObject({ retryCount: 1, waitedMs: 10 });
    expect(success(await h.writer.read({ reference })).content).toBe("record");
  });
  it("retains the exhausted loop's figures on both the outcome and its failure", async () => {
    const h = setup();
    let counterVersion: RecordVersion | null = null;
    const counter = recordReferences["project-registry/counter"](OwnerIdentitySchema.parse({ type: "project", name: "project" }), "race");
    let value = 0;
    h.remote.beforePublish = async () => {
      const saved = success(await h.writer.write({ action: "put", reference: counter, expected: counterVersion,
        content: JSON.stringify({ value: ++value }), provenance }));
      counterVersion = saved.version ?? null;
    };
    expect(success(await h.store.push()).publishes[0]).toMatchObject({ status: "failed", retryCount: 3, waitedMs: 30,
      failure: { code: "retries-exhausted", retryCount: 3, waitedMs: 30 } });
  });
});
