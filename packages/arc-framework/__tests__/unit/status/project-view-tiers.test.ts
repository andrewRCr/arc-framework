/** Tier membership is shared by project and identity status without rendering rows. */
import { expect, it } from "vitest";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { classifyProjectReadinessRecords, composeProjectReadinessViewResult, mergeProjectReadinessRecords } from "../../../src/lib/status/project-view.js";
import { inFlightRecord, record } from "../../helpers/status-view-fixtures.js";

const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-01-02T03:04:05.000Z", reason: "Wait for a dependency" });

it("removes a paused parked pointer from the ordinary rendered tiers", () => {
  const candidate = { ...inFlightRecord("paused", { state: "Active", scheduling: "parked" }), pause, class: "Heavy" as const };
  const result = composeProjectReadinessViewResult({ title: "Roadmap", renderedRef: "abcdef0", records: mergeProjectReadinessRecords([candidate]) });
  const ordinary = result.markdown.split(/(?=^## )/mu).filter(section => !section.startsWith("## Paused\n")).join("");
  expect(ordinary).not.toMatch(/\| paused\s+\|/u);
});

it("classifies the frozen graph into record tiers while retaining store source and Class", () => {
  const records = mergeProjectReadinessRecords([
    inFlightRecord("flight", { state: "Active", owner: "andrew", priority: "P1", cohort: "parent/cohort" }),
    record("ready", { priority: "P2", class: "Heavy", source: { kind: "store", location: "planned" } }),
    record("blocked-one", { dependsOn: ["missing"] }),
    record("blocked-two", { dependsOn: ["blocked-one"] }),
    record("parked-pointer", { scheduling: "parked", location: "active", state: "Active" }),
    record("parked-planned", { state: "Active" }),
  ]);
  const tiers = classifyProjectReadinessRecords({ records });
  expect({
    inFlight: tiers.inFlight.map(item => item.slug), ready: tiers.ready.map(item => item.slug),
    blocked: tiers.blocked.map(item => ({ slug: item.record.slug, unsatisfied: item.unsatisfied })),
    paused: tiers.paused, parked: tiers.parked.map(item => item.slug),
  }).toEqual({
    inFlight: ["flight"], ready: ["ready"],
    blocked: [{ slug: "blocked-one", unsatisfied: ["missing"] }, { slug: "blocked-two", unsatisfied: ["blocked-one"] }],
    paused: [], parked: ["parked-planned", "parked-pointer"],
  });
  expect(tiers.ready[0]).toMatchObject({ class: "Heavy", source: { kind: "store", location: "planned" } });
});

it.each((["active", "planned", "provisional", "completed"] as const).flatMap(location =>
  (["Planning", "Active"] as const).map(state => ({ location, state })),
))("carries pause at $location/$state exclusively in the Paused tier", ({ location, state }) => {
  const records = mergeProjectReadinessRecords([{ ...record("paused", { location, state }), pause }]);
  const tiers = classifyProjectReadinessRecords({ records });
  expect(tiers.paused).toEqual(records);
  expect([...tiers.inFlight, ...tiers.ready, ...tiers.blocked, ...tiers.parked]).toEqual([]);
});
