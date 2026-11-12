/** On-demand views may omit repository-file freshness metadata completely. */
import { expect, it } from "vitest";
import { composeProjectReadinessViewResult, mergeProjectReadinessRecords } from "../../../src/lib/status/project-view.js";
import { record } from "../../helpers/status-view-fixtures.js";

it("joins the title directly to the description when no render stamp is supplied", () => {
  const options = { title: "Roadmap", records: mergeProjectReadinessRecords([record("ready")]) };
  const result = composeProjectReadinessViewResult(options);
  expect(result.markdown).toMatch(/^# Roadmap\n\nThis view is a derived readiness/u);
  expect(result.markdown).not.toContain("Generated from meta files");
  expect(result.markdown).not.toContain("Source scope:");
  expect(result.markdown).not.toContain("Live view:");
  expect(result.markdown).not.toMatch(/^# Roadmap\n\n\n/u);
});
