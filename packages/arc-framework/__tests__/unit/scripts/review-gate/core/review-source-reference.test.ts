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
  ["missing owner UID", { workItem: { type: "work-item", name: "review" } }],
  ["person owner", { workItem: { type: "person", name: "reviewer" } }],
  ["cohort owner", { workItem: { type: "cohort", name: "review", uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" } }],
  ["invalid owner UID", { workItem: { type: "work-item", name: "review", uid: "not-a-uid" } }],
  ["empty project", { repositoryId: "" }],
  ["invalid operation ID", { operationId: "bad operation" }],
  ["oversized operation ID", { operationId: "a".repeat(129) }],
  ["unknown payload field", { unrelated: true }],
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

  it.each(invalidCoordinates)("refuses %s on operation and source locators", (_label, patch) => {
    const input = { ...operation, ...patch };
    expect.soft(() => bindNativeReviewOperationReference(input as NativeReviewOperationReference))
      .toThrow();
    const source = { ...input, kind: "hosted", durableRef: "acknowledged-attempt" } as BoundReviewSourceReference;
    expect.soft(() => bindReviewSourceReference(source)).toThrow();
  });

  it.each(invalidCoordinates)("refuses decoded %s from an external locator", (_label, patch) => {
    const operationRef = replacePayload(bindNativeReviewOperationReference(operation), patch);
    expect.soft(() => parseNativeReviewOperationReference(operationRef)).toThrow();
    const sourceRef = replacePayload(bindReviewSourceReference({ ...operation, kind: "hosted",
      durableRef: "acknowledged-attempt" }), patch);
    expect.soft(() => parseReviewSourceReference(sourceRef, "hosted", true)).toThrow();
  });

  it("rejects a native source decoded as another source kind", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "hosted", durableRef: "acknowledged-attempt" });
    expect(() => parseReviewSourceReference(reference, "frontline", true)).toThrow("kind mismatch");
  });

  it("rejects incomplete native coordinates rather than falling back to a repository reference", () => {
    expect(() => bindReviewSourceReference({ kind: "frontline", operationId: operation.operationId,
      durableRef: "result-key", repositoryId: operation.repositoryId } as BoundReviewSourceReference))
      .toThrow();
  });

  it("keeps repository readers from accepting native owner coordinates", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "frontline", durableRef: "result-key" });
    expect(() => parseReviewSourceReference(reference, "frontline")).toThrow();
  });

  it("refuses an unsupported operation reference version", () => {
    const reference = bindNativeReviewOperationReference(operation).replace(":v1:", ":v9:");
    expect(() => parseNativeReviewOperationReference(reference)).toThrow();
  });

  it("refuses an unsupported native source reference version", () => {
    const reference = bindReviewSourceReference({ ...operation, kind: "hosted", durableRef: "attempt" })
      .replace(":v2:", ":v9:");
    expect(() => parseReviewSourceReference(reference, "hosted", true)).toThrow();
  });

});
