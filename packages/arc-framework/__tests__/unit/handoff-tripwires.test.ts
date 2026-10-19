import { expect, it } from "vitest";
import { reportHandoffTripwires, HandoffTripwireReportSchema } from "../../src/lib/handoff/tripwires.js";
it.each([
  { commits: 2001, diskBytes: 10, exceeded: { commits: 2001 } },
  { commits: 1, diskBytes: 50_000_001, exceeded: { diskBytes: 50_000_001 } },
])("reports only the exceeded growth figure: $exceeded", ({ commits, diskBytes, exceeded }) => {
  const ref = "refs/arc/user/alice/personal";
  const report = reportHandoffTripwires({ maintenance: { measurements: [{ ref, commits, diskBytes }] } });
  expect(report).toEqual({ growth: [{ ref, ...exceeded, text: expect.stringContaining("scheduled ref rotation") }], contention: null });
  expect(HandoffTripwireReportSchema.parse(report)).toEqual(report);
});
it.each([
  { retryCount: 2, waitedMs: 0, exceeded: { retryCount: 2 } },
  { retryCount: 0, waitedMs: 10001, exceeded: { waitedMs: 10001 } },
  { retryCount: 2, waitedMs: 10001, exceeded: { retryCount: 2, waitedMs: 10001 } },
])("reports only exceeded publish contention: $exceeded", ({ retryCount, waitedMs, exceeded }) => {
  const publish = { status: "pushed", families: ["personal"], retryCount, waitedMs };
  expect(reportHandoffTripwires({ push: publish })).toEqual({ growth: [], contention: { ...exceeded,
    text: expect.stringMatching(/service backend.*per-record authorization.*very high write parallelism/u) } });
});
it("reports growth for exactly the four never-retiring ref families", () => {
  const refs = ["refs/arc/user/alice/personal", "refs/arc/user/alice/claims", "refs/arc/project/inbox", "refs/arc/project/registry"];
  const measurements = [...refs, "refs/arc/work/123", "refs/arc/cohort/456"].map(ref => ({ ref, commits: 2001, diskBytes: 50_000_001 }));
  const report = reportHandoffTripwires({ maintenance: { measurements } });
  expect(report.growth.map(item => item.ref)).toEqual(refs);
  expect(report.growth).toEqual(refs.map(ref => ({ ref, commits: 2001, diskBytes: 50_000_001, text: expect.stringContaining("scheduled ref rotation") })));
});
it.each([
  { commits: 2000, diskBytes: 50_000_000, retryCount: 1, waitedMs: 10000 },
  { commits: 1999, diskBytes: 49_999_999, retryCount: 0, waitedMs: 9999 },
  { commits: 0, diskBytes: 0, retryCount: 0, waitedMs: 0 },
])("figures at or below every bound produce no report: $commits/$retryCount", ({ commits, diskBytes, retryCount, waitedMs }) => {
  expect(reportHandoffTripwires({ maintenance: { measurements: [{ ref: "refs/arc/project/inbox", commits, diskBytes }] }, push: { retryCount, waitedMs } })).toEqual({ growth: [], contention: null });
});
it("unsupported measurements and zero retries produce no report", () => {
  expect(reportHandoffTripwires({ maintenance: { measurements: null }, push: { retryCount: 0, waitedMs: 0 } })).toEqual({ growth: [], contention: null });
  expect(reportHandoffTripwires({})).toEqual({ growth: [], contention: null });
});
