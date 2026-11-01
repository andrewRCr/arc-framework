import { describe, expect, it } from "vitest";

import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { metadataRef as ref, metadataValue, refObjectReadFixture as fixture } from "../../../helpers/store/ref-object-read.js";

describe("ref store metadata facts", () => {
  it("lists an entry whose metadata blob is missing with a restore remedy", async () => {
    const { store } = fixture({ missingMetadata: true });
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
      status: "unreadable", remedy: { text: expect.stringMatching(/Restore.*missing/u) },
    } });
  });

  it.each([
    ["absent entry", null], ["invalid JSON", "not JSON"],
    ["unknown version", JSON.stringify({ ...metadataValue, formatVersion: 2 })],
    ["unknown field", JSON.stringify({ ...metadataValue, unknown: true })],
    ["invalid format", JSON.stringify({ ...metadataValue, formats: { bad: 0 } })],
    ["invalid UTF-8", new Uint8Array([0xff])],
    ["missing slug", JSON.stringify({ formatVersion: 1, formats: {} })],
  ] as const)("lists %s with a forward repair", async (_label, metadata) => {
    const { store } = fixture({ metadata });
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
      status: "unreadable", remedy: { text: expect.stringContaining("forward") },
    } });
  });

  it.each(["tree", "commit"] as const)("lists a present %s at the metadata path as unreadable", async type => {
    const { store } = fixture({ type });
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
      status: "unreadable", remedy: { text: expect.stringContaining("forward") },
    } });
  });

  it("keeps a foreign metadata filename distinct from unavailable metadata", async () => {
    const { store } = fixture({ metadataName: "metadata-22345678-1234-4234-8234-123456789abc.json" });
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
      status: "complete", records: [], diagnostics: [{ kind: "key-mismatch", key: "extra-alpha.md" }],
    } });
  });

  it("lists valid metadata under its owner without adding fields to the listing schema", async () => {
    const { store } = fixture();
    const result = await store.list({ family: "work-item" });
    expect(result).toMatchObject({ status: "ok", result: { status: "complete", missed: false,
      records: [expect.objectContaining({ content: "kept", reference: expect.objectContaining({ owner: expect.objectContaining({ name: "alpha" }) }) })], diagnostics: [],
    } });
    if (result.status !== "ok") throw new Error("Expected listing");
    expect(ListingOutcomeSchema.safeParse(result.result).success).toBe(true);
  });

  it("reads present path-query metadata without enumerating its tree", async () => {
    const { store, calls, reference } = fixture();
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content: "kept", reference } });
    expect(calls.some(args => args[0] === "diff-tree")).toBe(false);
  });

  it("refuses present malformed path-query metadata with a forward repair", async () => {
    const { store, reference } = fixture({ metadata: "not JSON" });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: ref, remedy: { text: expect.stringContaining("forward") },
    } });
  });
});
