import { describe, expect, it } from "vitest";
import { parseReviewAdversarialPass, decodeReviewAdversarialPass } from "../../../../../../../src/lib/store/kinds/review/adversarial-pass/parser.js";
import { adversarialActivities, adversarialPassFixture } from "../../../../../../fixtures/review-adversarial-pass.js";

describe("adversarial pass envelopes", () => {
  it.each(adversarialActivities)("parses the complete %s record", (activity) => {
    const value = adversarialPassFixture(activity);
    expect(parseReviewAdversarialPass(JSON.stringify(value))).toEqual(value);
  });
  it("refuses an unknown activity or next-pass authorization", () => {
    const value = adversarialPassFixture();
    expect(parseReviewAdversarialPass(JSON.stringify({ ...value, activity: "unknown" }))).toBeNull();
    expect(parseReviewAdversarialPass(JSON.stringify({ ...value, nextPassAuthorized: true }))).toBeNull();
  });
  it.each(adversarialActivities)("binds exactly the artifacts for %s", (activity) => {
    const value = adversarialPassFixture(activity);
    expect(parseReviewAdversarialPass(JSON.stringify({ ...value, artifacts: {} }))).toBeNull();
    expect(parseReviewAdversarialPass(JSON.stringify({ ...value, artifacts: { ...value.artifacts, unrelated: "another-version" } }))).toBeNull();
  });
  it.each(["verification", "criteria"] as const)("requires the reviewed code head for %s", (activity) => {
    const { codeHead: ignored, ...value } = adversarialPassFixture(activity);
    void ignored;
    expect(parseReviewAdversarialPass(JSON.stringify(value))).toBeNull();
  });
  it.each(["schemaVersion", "activity", "artifacts", "rubric", "pass", "approvedBy", "approvedAt", "stopReason", "dispositions", "report"])(
    "requires the %s header field", (field) => {
      const value = Object.fromEntries(Object.entries(adversarialPassFixture()).filter(([key]) => key !== field));
      expect(parseReviewAdversarialPass(JSON.stringify(value))).toBeNull();
    },
  );
  it("refuses two approved dispositions for the same finding", () => {
    const value = adversarialPassFixture();
    expect(parseReviewAdversarialPass(JSON.stringify({ ...value,
      dispositions: [...value.dispositions, { ...value.dispositions[0], action: "reject" }] }))).toBeNull();
  });
  it("retains a spec's optional input draft", () => {
    const value = adversarialPassFixture("spec-finalization");
    const complete = { ...value, artifacts: { ...value.artifacts, draft: "draft-version" } };
    expect(parseReviewAdversarialPass(JSON.stringify(complete))).toEqual(complete);
  });
  it.each(["report", "account", "ongoing"] as const)("retains unchecked prose or an ongoing loop's %s value", (field) => {
    const value = adversarialPassFixture();
    const changed = field === "report" ? { ...value, report: "" } : field === "ongoing" ? { ...value, stopReason: null }
      : { ...value, dispositions: value.dispositions.map((finding) => ({ ...finding, account: "" })) };
    expect(parseReviewAdversarialPass(JSON.stringify(changed))).toEqual(changed);
  });
  it("retains a recorded over-cap approval without authorizing another pass", () => {
    const value = { ...adversarialPassFixture(), pass: { number: 3, cap: 2 },
      overCapApproval: { approvedBy: "andrew", approvedAt: "2026-10-19T12:00:00Z" } };
    expect(parseReviewAdversarialPass(JSON.stringify(value))).toEqual(value);
  });
  it("reports malformed JSON and a precise header decoding path", () => {
    expect(parseReviewAdversarialPass("{")).toBeNull();
    expect(decodeReviewAdversarialPass("{")).toEqual({ success: false, error: expect.stringMatching(/^JSON:/u) });
    expect(decodeReviewAdversarialPass(JSON.stringify({ ...adversarialPassFixture(), approvedAt: "bad-time" })))
      .toEqual({ success: false, error: expect.stringMatching(/approvedAt:/u) });
  });
});
