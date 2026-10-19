/** Every status mode shares pull orientation and coded diagnostics. */
import { expect, it } from "vitest";
import { pullStoreStatus } from "../../../../src/handlers/status/store-locus.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import type { PullResult } from "../../../../src/lib/store/operational-sync.js";

it.each(["pulled", "noop", "no-remote"] as const)("renders %s without a warning", async status => {
  expect(await pullStoreStatus({ sync: createStoreSyncPort({ pull: async () => ({ status }) }) })).toEqual([]);
});

it.each([
  { pull: { status: "no-identity" }, rendered: "No store identity is configured. Run git config arc.identity <name> and retry." },
  { pull: { status: "unreachable", condition: "State remote offline.", remedy: { text: "Reconnect and retry." } },
    rendered: "State remote offline. Reconnect and retry." },
  { pull: { status: "designation-needed", remote: "backup", choices: ["state", "code-and-state"],
    remedy: { text: "Choose the state role.", argv: ["arc", "store", "remote", "backup", "state"] } },
    rendered: "Remote backup needs a store designation. Choose the state role. arc store remote backup state" },
] satisfies { pull: PullResult; rendered: string }[])("codes $pull.status with its shared orientation and repair route", async ({ pull, rendered }) => {
  expect(await pullStoreStatus({ sync: createStoreSyncPort({ pull: async () => pull }) }))
    .toEqual([{ code: "pull-incomplete", rendered }]);
});

it.each(["pulled", "incomplete"] as const)("renders every notice from a %s outcome, including retained ended conflicts", async status => {
  const { PullResultSchema } = await import("../../../../src/lib/store/sync.js");
  const { RecordReferenceSchema } = await import("../../../../src/lib/store/identity.js");
  const item = { type: "work-item", name: "alpha", uid: "11111111-1111-4111-8111-111111111111" };
  const conflict = RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner: item, key: "held" });
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: item });
  const shapes = [
    { kind: "history-diverged", ref: "held-ref", local: "a".repeat(40), remote: "b".repeat(40) },
    { kind: "tracking-update-failed", ref: "held-ref" }, { kind: "ended-with-conflicts", item, conflicts: [conflict] },
    { kind: "end-withdrawn", item }, { kind: "ended-twice", item },
    { kind: "rule-broken", reference, rule: "retained-rule" }, { kind: "end-pending", item, ref: "held-ref" },
    { kind: "namespace-corrupt", ref: "held-ref" },
  ];
  const partial = PullResultSchema.parse({ states: [], pulls: [{ status: "failed", remote: "backup", role: "state", families: ["work-item"],
    failure: { code: "refused", class: "terminal", condition: "Backup refused state.", message: "Backup refused state.", remedy: { text: "Repair backup." } },
    notices: shapes.map(shape => ({ ...shape, condition: `${shape.kind} observed.`, remedy: { text: `Repair ${shape.kind}.` } })) }] });
  const notices = partial.pulls[0]!.notices;
  const pull: PullResult = status === "pulled" ? { status, notices }
    : { status, condition: "Backup refused state.", remedy: { text: "Repair backup." }, partial, notices: [notices[0]!] };
  const warnings = await pullStoreStatus({ sync: createStoreSyncPort({ pull: async () => pull }) });
  if (status === "incomplete") expect(warnings[0]).toEqual({ code: "pull-incomplete", rendered: "Backup refused state. Repair backup." });
  const rendered = warnings.filter(warning => warning.code === "pull-notice");
  expect(rendered).toHaveLength(notices.length);
  for (const notice of notices) {
    const warning = rendered.find(value => value.rendered.includes(notice.condition));
    expect(warning?.rendered).toContain(notice.remedy.text);
  }
  const ended = rendered.find(value => value.rendered.includes("ended-with-conflicts observed."))?.rendered ?? "";
  expect(ended).toContain("alpha");
  expect(ended).toContain(JSON.stringify(conflict));
  expect(ended).toMatch(/conflict view.*(?:omit|not list)/u);
});
