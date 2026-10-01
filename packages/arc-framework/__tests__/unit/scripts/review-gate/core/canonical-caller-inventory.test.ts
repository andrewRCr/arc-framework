/** Closed production caller inventory for review-gate canonicalization domains. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../../src/scripts/review-gate", import.meta.url));

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

const files = typescriptFiles(root);
const source = (path: string): string => readFileSync(path, "utf8");
const name = (path: string): string => relative(root, path).replaceAll("\\", "/");

function directUsers(symbol: string, definition: string): string[] {
  return files
    .filter((path) => name(path) !== definition && source(path).includes(symbol))
    .map(name)
    .sort();
}

describe("review-gate canonical serializer inventory", () => {
  it("closes the kernel-backed helper caller set", () => {
    expect([
      "core/identity.ts",
      ...directUsers("canonicalizePlainJson", "core/identity.ts"),
    ].sort()).toEqual([
      "core/identity.ts",
    ]);
  });

  it("closes the frozen version-one caller set", () => {
    expect(directUsers("canonicalizeReviewGateV1", "core/legacy-canonical-v1.ts")).toEqual([
      "core/request-key.ts",
    ]);
  });

  it("keeps kernel canonicalize direct and removes parallel serializers", () => {
    const kernelImports = files
      .filter((path) => /import\s*\{[^}]*\bcanonicalize\b[^}]*\}\s*from\s*["'][^"']*kernel[^"']*["']/su
        .test(source(path)))
      .map(name);
    expect(kernelImports).toEqual([
      "core/dispositions.ts",
      "core/gate-contract-v2-schema.ts",
      "core/gate-contract-v2.ts",
      "core/identity.ts",
      "core/lane-attempt-validation.ts",
      "core/local-operation.ts",
      "core/local-prepare.ts",
      "core/operation-state-schema.ts",
      "core/review-result-disposition.ts",
      "hosted/request.ts",
      "hosts/local/disposition-record-store.ts",
      "hosts/local/frontline-outcome-store.ts",
      "hosts/local/hosted-request-owner-index.ts",
      "hosts/local/operation-state-store.ts",
      "hosts/local/receipt-store.ts",
      "hosts/local/review-result-reader.ts",
      "hosts/local/source-store.ts",
      "lane-progress-conditional.ts",
      "lane-progress-hosted-request.ts",
      "lane-progress-hosted-settlement.ts",
      "lane-progress-seal-recovery.ts",
      "lane-progress.ts",
      "policy/candidate-review-fix-continuation.ts",
      "policy/delivery-review-terminus.ts",
      "policy/frontline-operation.ts",
      "policy/hosted-reservation-admission.ts",
      "policy/hosted-reservation-discharge.ts",
      "policy/hosted-reservation-support.ts",
      "policy/incremental-coverage-basis.ts",
      "policy/integration-boundary-locus.ts",
      "policy/local-review-coverage-selection.ts",
      "policy/local-review-guidance.ts",
      "policy/local-review-policy.ts",
      "policy/pre-publication-request.ts",
      "policy/review-applicability-authority.ts",
      "policy/review-applicability-resolution.ts",
      "policy/review-policy-evidence.ts",
      "policy/standard-review-guidance.ts",
      "policy/standard-review-schema.ts",
      "policy/standard-review.ts",
      "runtime/frontline-run-command.ts",
      "runtime/local-attest-command.ts",
      "runtime/local-pending-replay.ts",
      "runtime/local-prepare-composition.ts",
      "runtime/local-prepare.ts",
      "runtime/respond-command.ts",
      "runtime/respond-composition.ts",
      "status-errand.ts",
    ]);

    const serializerDeclarations = files.flatMap((path) => {
      const matches = source(path).matchAll(
        /function\s+(normalizePlainJson|canonicalizePlainJson|canonicalizeReviewGateV1)\s*\(/gu,
      );
      return [...matches].map((match) => `${name(path)}:${match[1] ?? ""}`);
    });
    expect(serializerDeclarations).toEqual([
      "core/identity.ts:canonicalizePlainJson",
      "core/legacy-canonical-v1.ts:normalizePlainJson",
      "core/legacy-canonical-v1.ts:canonicalizeReviewGateV1",
    ]);

    const barrelExports = files.filter((path) => /export\s*\{[^}]*(?:canonicalizePlainJson|canonicalizeReviewGateV1)/su
      .test(source(path)));
    expect(barrelExports).toEqual([]);
  });

  it("keeps NUL-delimited identities outside JSON serialization", () => {
    const identity = source(join(root, "core/identity.ts"));
    const requestKey = source(join(root, "core/request-key.ts"));
    const changeSetBody = identity.slice(
      identity.indexOf("export function computeChangeSetId"),
      identity.indexOf("export function computePolicyVersion"),
    );
    const requestBodies = requestKey.slice(
      requestKey.indexOf("export function computeRequirementKey"),
      requestKey.indexOf("function computeIdempotencyKey"),
    );

    expect(changeSetBody).toContain("\\0");
    expect(changeSetBody).not.toMatch(/canonicalize/u);
    expect(requestBodies).toContain('.join("\\0")');
    expect(requestBodies).not.toMatch(/canonicalize/u);
  });
});
