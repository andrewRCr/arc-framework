/** Supplied dependency resolutions keep satisfaction, readiness and depth consistent. */
import { expect, it } from "vitest";
import { composeProjectReadinessViewResult, mergeProjectReadinessRecords, type ProjectReadinessProvider } from "../../../src/lib/status/project-view.js";
import { record } from "../../helpers/status-view-fixtures.js";

it("satisfies a former slug resolved to a shipped listed record without a dangling warning", () => {
  const options = {
    title: "Roadmap", renderedRef: "abcdef0", records: mergeProjectReadinessRecords([
      record("done", { location: "completed", state: "Shipped" }), record("dependent", { dependsOn: ["former"] }),
    ]),
    dependencyResolutions: new Map([["dependent", new Map([["former", { kind: "listed" as const, slug: "done" }]])]]),
  };
  const result = composeProjectReadinessViewResult(options);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ dependencySatisfaction: "satisfied", readiness: "ready", unsatisfiedDependencies: [] });
  expect(result.warnings).toEqual([]);
});

it("bands an unshipped resolved target below its dependency while displaying the written edge", () => {
  const options = {
    title: "Roadmap", renderedRef: "abcdef0", records: mergeProjectReadinessRecords([
      record("target", { dependsOn: ["missing"] }), record("dependent", { dependsOn: ["former"] }),
    ]),
    dependencyResolutions: new Map([["dependent", new Map([["former", { kind: "listed" as const, slug: "target" }]])]]),
  };
  const result = composeProjectReadinessViewResult(options);
  expect(result.markdown.split("### Depth 2")[1]).toContain("dependent");
  expect(result.markdown.split("### Depth 2")[1]).toContain("former");
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ dependencySatisfaction: "unsatisfied", readiness: "blocked", unsatisfiedDependencies: ["former"] });
  expect(result.warnings.map(warning => warning.workUnit)).toEqual(["target"]);
});

it.each([true, false])("uses an external generation's satisfied=%s verdict independently of its standing namesake", satisfied => {
  const options = {
    title: "Roadmap", renderedRef: "abcdef0", records: mergeProjectReadinessRecords([
      record("reused", { dependsOn: ["missing"] }), record("dependent", { dependsOn: ["former"] }),
    ]),
    dependencyResolutions: new Map([["dependent", new Map([["former", { kind: "verdict" as const, slug: "reused", satisfied }]])]]),
  };
  const result = composeProjectReadinessViewResult(options);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({
    dependencySatisfaction: satisfied ? "satisfied" : "unsatisfied", readiness: satisfied ? "ready" : "blocked",
  });
  expect(result.warnings.map(warning => warning.workUnit)).toEqual(["reused"]);
  expect(result.markdown).not.toContain("### Depth 2");
});

it.each([true, false])("retains an unresolved edge and its supplied-warning=%s policy", includeWarning => {
  const warning = { code: "dependency-retired" as const, workUnit: "dependent", dependency: "retired",
    rendered: "Origin retired by abandonment; the dependent's dependency reconcile applies its disposition." };
  const options = {
    title: "Roadmap", renderedRef: "abcdef0", records: mergeProjectReadinessRecords([record("dependent", { dependsOn: ["retired"] })]),
    dependencyResolutions: new Map([["dependent", new Map([["retired", { kind: "unsatisfied" as const, ...(includeWarning ? { warning } : {}) }]])]]),
  };
  const result = composeProjectReadinessViewResult(options);
  expect(result.warnings).toEqual(includeWarning ? [warning] : []);
  expect(result.facts[0]).toMatchObject({ dependencySatisfaction: "unsatisfied", readiness: "blocked", unsatisfiedDependencies: ["retired"] });
});

it("honors an explicit readiness provider after resolving dependency satisfaction", () => {
  const readinessProvider: ProjectReadinessProvider = { resolve: records => new Map(records.map(item => [item.slug, "blocked" as const])) };
  const options = {
    title: "Roadmap", renderedRef: "abcdef0", readinessProvider,
    records: mergeProjectReadinessRecords([record("done", { location: "completed", state: "Shipped" }), record("dependent", { dependsOn: ["former"] })]),
    dependencyResolutions: new Map([["dependent", new Map([["former", { kind: "listed" as const, slug: "done" }]])]]),
  };
  const result = composeProjectReadinessViewResult(options);
  expect(result.facts.find(fact => fact.slug === "dependent")).toMatchObject({ dependencySatisfaction: "satisfied", readiness: "blocked", unsatisfiedDependencies: [] });
  expect(result.markdown.split("## Blocked")[1]).toContain("dependent");
});
