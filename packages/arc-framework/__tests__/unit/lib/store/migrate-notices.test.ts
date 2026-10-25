/** Migration reports retain every pull observation's complete subject beside its recovery text. */
import { expect, it } from "vitest";
import { migrateNoticeFromPull, MigrateReportSchema } from "../../../../src/lib/store/commands.js";
import { PullNoticeSchema } from "../../../../src/lib/store/sync.js";

const item = { type: "work-item", name: "alpha", uid: "12345678-1234-4234-8234-123456789abc" };
const reference = { owner: item, kind: "work-item/meta" };
const conflicts = [{ owner: item, kind: "work-item/conflict-record", key: "conflict-one" }];
const ref = `refs/arc/history/work/${item.uid}`;
const subjects = [
  { kind: "history-diverged", ref, local: "a".repeat(40), remote: "b".repeat(40) },
  { kind: "tracking-update-failed", ref },
  { kind: "ended-with-conflicts", item, conflicts },
  { kind: "end-withdrawn", item },
  { kind: "ended-twice", item },
  { kind: "rule-broken", reference, rule: "primary.valid" },
  { kind: "end-pending", item, ref },
  { kind: "namespace-corrupt", ref },
];

it.each(subjects)("keeps the full $kind subject in report text", subject => {
  const notice = PullNoticeSchema.parse({ ...subject, condition: "Observed condition with its original detail.",
    remedy: { text: "Repair the named subject and retry.", argv: ["arc", "store", "pull"] } });
  const converted = migrateNoticeFromPull(notice);
  expect(converted.condition).toContain(JSON.stringify(subject));
  expect(converted.condition).toContain(notice.condition);
  expect(converted.remedy).toEqual(notice.remedy);
  expect(MigrateReportSchema.parse({ move: "remote", refs: [], refused: [], brokenChains: [], reviewMapping: [],
    differingNotes: [], notices: [converted] }).notices).toEqual([converted]);
});
