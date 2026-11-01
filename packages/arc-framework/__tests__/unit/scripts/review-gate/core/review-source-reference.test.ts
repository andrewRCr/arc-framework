/** Native references retain exact owners without altering repository reference values. */
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { bindReviewSourceReference, parseReviewSourceReference, type BoundReviewSourceReference } from
  "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { bindNativeReviewOperationReference, parseNativeReviewOperationReference, type NativeReviewOperationReference } from
  "../../../../../src/scripts/review-gate/core/review-operation-reference.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "original-review",
  uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" });
const operation = { repositoryId: "project-id", workItem: owner, operationId: "local-review/producer" };

const invalidCoordinates = [
  ["missing owner UID", { workItem: { type: "work-item", name: "review" } }, ["workItem"], "custom"],
  ["person owner", { workItem: { type: "person", name: "reviewer" } }, ["workItem"], "custom"],
  ["cohort owner", { workItem: { type: "cohort", name: "review", uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" } }, ["workItem"], "custom"],
  ["invalid owner UID", { workItem: { type: "work-item", name: "review", uid: "not-a-uid" } }, ["workItem", "uid"], "invalid_format"],
  ["empty project", { repositoryId: "" }, ["repositoryId"], "invalid_format"],
  ["invalid operation ID", { operationId: "bad operation" }, ["operationId"], "invalid_format"],
  ["oversized operation ID", { operationId: "a".repeat(129) }, ["operationId"], "invalid_format"],
  ["unknown payload field", { unrelated: true }, [], "unrecognized_keys"],
] as const;

function replacePayload(reference: string, patch: object): string {
  const separator = reference.lastIndexOf(":");
  const payload = JSON.parse(decodeURIComponent(reference.slice(separator + 1))) as object;
  return reference.slice(0, separator + 1) + encodeURIComponent(JSON.stringify({ ...payload, ...patch }));
}

describe("portable review references", () => {
  it("retains project, exact owner, kind and durable result coordinates", () => {
    const source = { ...operation, kind: "attested-local" as const, durableRef: "local-result-key" };
    const reference = bindReviewSourceReference(source);
    expect(parseReviewSourceReference(reference, "attested-local", true)).toEqual(source);
  });

  it("retains an operation's exact admitted owner without encoding it in the operation ID", () => {
    const reference = bindNativeReviewOperationReference(operation);
    expect(parseNativeReviewOperationReference(reference)).toEqual(operation);
    expect(reference).not.toBe(operation.operationId);
  });

  it("retains long legal names and maximum-length IDs as separate coordinates", () => {
    const input = { ...operation, workItem: OwnerIdentitySchema.parse({ ...owner, name: "work-".repeat(50) + "unit" }),
      operationId: "a".repeat(128) };
    expect(parseNativeReviewOperationReference(bindNativeReviewOperationReference(input))).toEqual(input);
    const source = { ...input, kind: "frontline" as const, durableRef: "result/" + "z".repeat(256) };
    expect(parseReviewSourceReference(bindReviewSourceReference(source), "frontline", true)).toEqual(source);
  });

  it("keeps hosted lane and acknowledged-attempt coordinates distinct", () => {
    const source = { ...operation, operationId: "standard/lane-owner", kind: "hosted" as const,
      durableRef: "hosted/acknowledged-attempt" };
    expect(parseReviewSourceReference(bindReviewSourceReference(source), "hosted", true)).toEqual(source);
  });

  it("preserves the repository codec's exact emitted values", () => {
    const source = { kind: "frontline" as const, operationId: "frontline/attempt", durableRef: "result:key" };
    const reference = bindReviewSourceReference(source);
    expect(reference).toBe("arc-review-source:v1:frontline:frontline%2Fattempt:result%3Akey");
    expect(parseReviewSourceReference(reference, "frontline")).toEqual(source);
  });

  it.each(invalidCoordinates)("refuses %s on operation and source locators", (_label, patch, path, code) => {
    const refusal = expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ path: [...path], code })]) });
    const input = { ...operation, ...patch };
    expect.soft(() => bindNativeReviewOperationReference(input as NativeReviewOperationReference))
      .toThrow(refusal);
    const source = { ...input, kind: "hosted", durableRef: "acknowledged-attempt" } as BoundReviewSourceReference;
    expect.soft(() => bindReviewSourceReference(source)).toThrow(refusal);
  });

  it.each(invalidCoordinates)("refuses decoded %s from an external locator", (_label, patch, path, code) => {
    const refusal = expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ path: [...path], code })]) });
    const operationRef = replacePayload(bindNativeReviewOperationReference(operation), patch);
    expect.soft(() => parseNativeReviewOperationReference(operationRef)).toThrow(refusal);
    const sourceRef = replacePayload(bindReviewSourceReference({ ...operation, kind: "hosted",
      durableRef: "acknowledged-attempt" }), patch);
    expect.soft(() => parseReviewSourceReference(sourceRef, "hosted", true)).toThrow(refusal);
  });

  it("rejects a native source decoded as another source kind", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "hosted", durableRef: "acknowledged-attempt" });
    expect(() => parseReviewSourceReference(reference, "frontline", true)).toThrow("kind mismatch");
  });

  it("rejects incomplete native coordinates rather than falling back to a repository reference", () => {
    expect(() => bindReviewSourceReference({ kind: "frontline", operationId: operation.operationId,
      durableRef: "result-key", repositoryId: operation.repositoryId } as BoundReviewSourceReference))
      .toThrow(expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ path: ["workItem"], code: "invalid_union" })]) }));
  });

  it("keeps repository readers from accepting native owner coordinates", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "frontline", durableRef: "result-key" });
    expect(() => parseReviewSourceReference(reference, "frontline")).toThrow("review source reference kind mismatch");
  });

  it("refuses an unsupported operation reference version", () => {
    const reference = bindNativeReviewOperationReference(operation).replace(":v1:", ":v9:");
    expect(() => parseNativeReviewOperationReference(reference)).toThrow("native review operation reference kind or version mismatch");
  });

  it("refuses an unknown native prefix version as a source kind mismatch", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "hosted", durableRef: "attempt" })
      .replace(":v2:", ":v9:");
    expect(() => parseReviewSourceReference(reference, "hosted", true)).toThrow("review source reference kind mismatch");
  });

});
