/** Accepted writes continue only typed transient publication failures within a finite call bound. */
import { expect, it } from "vitest";
import { PushResultSchema, storeResultSchema, type PushResult, type StoreResult } from "../../src/lib/store/index.js";
import { publishAcceptedWrite } from "../helpers/store/ref-publication.js";

const envelope = storeResultSchema(PushResultSchema);
const clean = envelope.parse({ status: "ok", result: { states: [],
  pulls: [{ status: "noop", remote: "origin", role: "state", families: ["personal"], notices: [] }],
  publishes: [{ status: "pushed", families: ["personal"], retryCount: 0, waitedMs: 0 }] } });
const condition = "The publication bound expired; earlier merges remain applied.";
const remedy = { text: "Retry the publication." };
function interrupted(code: "timeout" | "retries-exhausted"): StoreResult<PushResult> {
  return envelope.parse({ status: "ok", result: { states: [],
    pulls: code === "timeout" ? [{ status: "failed", remote: "origin", role: "state", families: ["personal"], notices: [],
      failure: { code: "unreachable", class: "recoverable", cause: "timeout", condition, remedy } }] : clean.status === "ok" ? clean.result.pulls : [],
    publishes: [{ status: "failed", families: ["personal"], retryCount: 4, waitedMs: 12_000,
      failure: code === "timeout" ? { code: "unreachable", class: "recoverable", cause: "timeout", condition, remedy }
        : { code, class: "recoverable", retryCount: 4, waitedMs: 12_000, condition, remedy } }] } });
}

it.each(["timeout", "retries-exhausted"] as const)("continues %s without losing any public attempt", async code => {
  const first = interrupted(code);
  const replies = [first, clean];
  const result = await publishAcceptedWrite({ push: async () => replies.shift() ?? clean });
  expect(result).toEqual({ publication: clean, publicationAttempts: [first, clean] });
});

it("returns the last recoverable stop after five public attempts", async () => {
  const failed = interrupted("timeout");
  expect(await publishAcceptedWrite({ push: async () => failed })).toEqual({
    publication: failed, publicationAttempts: Array.from({ length: 5 }, () => failed),
  });
});

it.each([
  { status: "refused", refusal: { code: "refused", class: "terminal", message: "Denied", condition: "Access denied", remedy: { text: "Correct permissions." } } },
  { status: "ok", result: { states: [{ status: "no-remote" }], pulls: [], publishes: [] } },
  { status: "ok", result: { states: [], pulls: [], publishes: [{ status: "failed", families: ["personal"], retryCount: 0, waitedMs: 0,
    failure: { code: "unreachable", class: "recoverable", cause: "auth", condition: "Credentials rejected", remedy: { text: "Repair credentials." } } }] } },
])("preserves terminal/configuration/credential stops", async reply => {
  const failure = envelope.parse(reply);
  expect(await publishAcceptedWrite({ push: async () => failure })).toEqual({ publication: failure, publicationAttempts: [failure] });
});
