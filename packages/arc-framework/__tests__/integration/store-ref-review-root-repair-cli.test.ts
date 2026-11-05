/** The built repair command works directly on native facts without legacy review records. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { runArcWithStdin } from "../e2e/helpers.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { ReviewRootRepairResultSchema } from "../../src/lib/store/review-root-repair-schema.js";

it.each(["default", "separate"] as const)("discovers, previews, and applies native repair through the built CLI (%s)", async layout => {
  const f = await competingReviewRoots(layout);
  const schema = await runArcWithStdin(["store", "repair-review-roots", "--schema"], f.b.root, "");
  expect(schema.exitCode, schema.stderr || schema.stdout).toBe(0);
  expect(JSON.parse(schema.stdout)).toMatchObject({ rootId: expect.stringContaining("store-repair-review-roots-request"),
    schemas: { "store-repair-review-roots-request": expect.any(Object) } });
  const directory = join(f.b.root, ".git", "arc", "review-gate", "evidence");
  await mkdir(directory, { recursive: true });
  const legacyPath = join(directory, `disposition-${canonicalDigest({ operationId: f.outcome.attemptId }).slice(7)}.json`);
  await writeFile(legacyPath, "unreadable legacy approval");
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  const file = join(f.b.root, "root-preview.json");
  await writeFile(file, JSON.stringify(request));
  const output = await runArcWithStdin(["store", "repair-review-roots", file], f.b.root, "");
  expect(output.exitCode, output.stderr || output.stdout).toBe(0);
  const preview = ReviewRootRepairResultSchema.parse(JSON.parse(output.stdout));
  if (preview.status !== "ok" || preview.result.state !== "preview-ready") throw new Error("Expected native preview");
  const apply = { ...request, operation: "apply", basis: preview.result.basis,
    selectedRoot: f.fix.value.dispositionSet.dispositionSetId, decidedBy: "andrew", reason: "Continue this approved fix." };
  const wrongResult = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root,
    JSON.stringify({ ...apply, basis: { ...apply.basis, resultDigest: canonicalDigest({ other: 1 }) } }));
  expect(wrongResult.exitCode).toBe(1);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(wrongResult.stdout))).toMatchObject({ status: "refused",
    refusal: { code: "version-conflict", remedy: { text: expect.stringContaining("repair-review-roots") } } });
  const written = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root, JSON.stringify(apply));
  expect(written.exitCode, written.stderr || written.stdout).toBe(0);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(written.stdout))).toMatchObject({ status: "ok", result: {
    state: "applied", selectedRoot: apply.selectedRoot } });
  expect(await f.nativeB.evidence.readDispositionRecord(f.outcome.attemptId)).toMatchObject({ currentDispositionSetId: apply.selectedRoot });
  const wrongOwner = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root,
    JSON.stringify({ ...request, workItem: { ...f.owner, uid: randomUUID() } }));
  expect(wrongOwner.exitCode).toBe(1);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(wrongOwner.stdout))).toMatchObject({ status: "refused",
    refusal: { code: "not-found", class: "recoverable" } });
  const wrongName = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root,
    JSON.stringify({ ...request, workItem: { ...f.owner, name: "former-name" } }));
  expect(wrongName.exitCode).toBe(1);
  expect(ReviewRootRepairResultSchema.parse(JSON.parse(wrongName.stdout))).toMatchObject({ status: "refused",
    refusal: { code: "identity-mismatch", class: "recoverable" } });
  expect(await readFile(legacyPath, "utf8")).toBe("unreadable legacy approval");
}, 180_000);
