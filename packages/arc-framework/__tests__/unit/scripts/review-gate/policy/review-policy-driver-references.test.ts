/** Ordinary grant references survive every full and targetless policy input carrier. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ReviewAdditionalPassAuthorizationSchema, ReviewCeilingOverrideSchema, ReviewLaneJudgmentSchema } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const decisionKey = canonicalDigest({ grant: "ordinary" });
const target = { repository: "owner/repository", pullRequest: 41, headSha: "a".repeat(40) };
const ceiling = { exhaustedPassCount: 2, nextPass: 3, decisionKey };
const additional = { precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3, decisionKey };

it.each([
  ["full ceiling", ReviewCeilingOverrideSchema, { ...ceiling, target, lane: "standard" }],
  ["full additional", ReviewAdditionalPassAuthorizationSchema, { ...additional, target, lane: "standard" }],
  ["targetless ceiling", ReviewLaneJudgmentSchema, { ceilingOverride: ceiling }],
  ["targetless additional", ReviewLaneJudgmentSchema, { additionalPassAuthorization: { ...additional, headSha: target.headSha } }],
] as const)("retains the recorded decision key in %s input", (_label, schema, value) => {
  expect(schema.safeParse(value)).toMatchObject({ success: true, data: value });
});

it.each([
  ["full", ReviewCeilingOverrideSchema, { ...ceiling, target, lane: "standard", conditionalPassAuthorizationId: decisionKey }],
  ["targetless", ReviewLaneJudgmentSchema, { ceilingOverride: { ...ceiling, conditionalPassAuthorizationId: decisionKey } }],
] as const)("refuses two decision identities in a %s ceiling input", (_label, schema, value) => {
  expect(schema.safeParse(value).success).toBe(false);
});
