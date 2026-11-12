/** Paused project rows present durable context and caller-supplied marks. */
import { expect, it } from "vitest";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { composeProjectReadinessViewResult, mergeProjectReadinessRecords } from "../../../src/lib/status/project-view.js";
import { record } from "../../helpers/status-view-fixtures.js";

it.each([
  { title: "note and review mark", location: "active", state: "Active", reason: "Wait | until\nready",
    waitsOn: { kind: "note", text: "Review | approval\nsoon" }, open: true, marks: ["review-due"],
    reasonCell: "Wait \\| until ready", waitsCell: "Review \\| approval soon", markCell: "review-due", lifecycle: "active" },
  { title: "work unit and resumable mark", location: "planned", state: "Planning", reason: "Wait for delivery",
    waitsOn: { kind: "work-unit", slug: "done" }, open: false, marks: ["resumable"],
    reasonCell: "Wait for delivery", waitsCell: "done", markCell: "resumable", lifecycle: "planned" },
  { title: "no wait or supplied mark", location: "active", state: "Active", reason: "Waiting",
    waitsOn: null, open: false, marks: undefined,
    reasonCell: "Waiting", waitsCell: "—", markCell: "—", lifecycle: "active" },
  { title: "empty supplied marks", location: "active", state: "Active", reason: "Waiting",
    waitsOn: null, open: true, marks: [],
    reasonCell: "Waiting", waitsCell: "—", markCell: "—", lifecycle: "active" },
] as const)("renders the pause's $title without changing lifecycle facts", scenario => {
  const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-01-02T03:04:05.000Z",
    reason: scenario.reason, waitsOn: scenario.waitsOn, open: scenario.open });
  const records = mergeProjectReadinessRecords([
    { ...record("paused", { location: scenario.location, state: scenario.state, owner: "andrew", priority: "P2", cohort: "parent/cohort" }), pause },
    ...(pause.waitsOn?.kind === "work-unit" ? [record("done", { location: "completed", state: "Shipped" })] : []),
  ]);
  const options = { title: "Roadmap", renderedRef: "abcdef0", records,
    ...(scenario.marks === undefined ? {} : { pausedMarks: new Map([["paused", scenario.marks]]) }) };
  const result = composeProjectReadinessViewResult(options);
  const section = result.markdown.split("## Paused\n")[1]?.split(/^## /mu)[0] ?? "";
  expect(section).toMatch(/\| Reason\s+\| Waits on\s+\| Open to takers\s+\| Mark\s+\|/u);
  expect(section).toContain(scenario.reasonCell);
  expect(section).toContain(scenario.waitsCell);
  expect(section).toMatch(new RegExp(`\\|\\s+${scenario.open}\\s+\\|\\s+${scenario.markCell}\\s+\\|`, "u"));
  expect(result.facts.find(fact => fact.slug === "paused")).toMatchObject({ state: scenario.lifecycle,
    horizonAdvisory: "`paused` is paused (P2); an entry routed here waits for its resumption. Resume it or send a separable part now?" });
});
