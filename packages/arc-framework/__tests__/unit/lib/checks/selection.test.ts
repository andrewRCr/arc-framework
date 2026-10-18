/** Check-level policy over established changed-input observations. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { resolveCheckSelection, selectCheckInputs } from "../../../../src/lib/checks/selection.js";
import type { CheckRequest } from "../../../../src/lib/checks/request.js";
const changedPath = { path: "src/a.ts", status: "M" as const, oldMode: "100644", newMode: "100644", oldBlob: "a".repeat(40), newBlob: "b".repeat(40) };
function selected({ own, widened = false, widen = true, ciOnly = false, request = { form: { kind: "gate", gate: "commit" } }, all = false }: {
  own: "changed" | "unchanged" | "unresolved"; widened?: boolean; widen?: boolean; ciOnly?: boolean; request?: CheckRequest; all?: boolean;
}) {
  const check = CheckDeclarationSchema.parse({ checks: { lint: { command: ["lint"], mode: "files", widen, ci_only: ciOnly } } }).checks.lint!;
  return selectCheckInputs({ id: "lint", check, request,
    resolved: { scope: { kind: all ? "all" : "changed" }, tree: "c".repeat(40), base: "a".repeat(40) },
    selection: { widened, own: new Map([["lint", own === "changed" ? { status: "selected", paths: [changedPath] }
      : own === "unchanged" ? { status: "not selected", reason: "inputs unchanged" } : { status: "unresolved" }]]) },
  });
}
it("keeps opt-out checks confined to own changed paths and excludes unknown own reach", () => {
  expect(selected({ own: "unchanged", widened: true, widen: false })).toEqual({ status: "not selected", reason: "inputs unchanged" });
  expect(selected({ own: "changed", widened: true, widen: false })).toEqual({ status: "selected", paths: [changedPath] });
  expect(selected({ own: "unresolved", widened: true, widen: false })).toEqual({ status: "not selected", reason: "own input change unavailable" });
});
it("selects all matching paths when widening reaches a check or when scope is all", () => {
  expect(selected({ own: "unchanged", widened: true })).toEqual({ status: "selected" });
  expect(selected({ own: "unchanged", all: true, widen: false })).toEqual({ status: "selected" });
});
it("labels CI exclusion even when widening or all scope would otherwise select the check", () => {
  expect(selected({ own: "changed", ciOnly: true, all: true })).toEqual({ status: "not selected", reason: "CI-only check requires --ci" });
  expect(selected({ own: "changed", ciOnly: true, request: { form: { kind: "gate", gate: "commit" }, ci: true } }))
    .toEqual({ status: "selected", paths: [changedPath] });
});
it("never widens an explicit named files request", () => {
  expect(selected({ own: "unchanged", widened: true, request: { form: { kind: "run", ids: ["lint"] } } }))
    .toEqual({ status: "not selected", reason: "inputs unchanged" });
});


it("bounds opt-out file checks at a default merge gate", () => {
  const request: CheckRequest = { form: { kind: "gate", gate: "merge" }, force: true };
  expect(selected({ own: "changed", all: true, widen: false, request })).toEqual({ status: "selected", paths: [changedPath] });
  expect(selected({ own: "unchanged", all: true, widen: false, request })).toEqual({ status: "not selected", reason: "inputs unchanged" });
  expect(selected({ own: "unresolved", all: true, widen: false, request })).toEqual({ status: "selected" });
  expect(selected({ own: "unchanged", all: true, widen: false, request: { ...request, scope: { kind: "all" } } })).toEqual({ status: "selected" });
});

it("keeps selection inputs outside Git coverage and widening", async () => {
  const git = scriptGitExec([{ match: { prefix: ["diff"] }, responses: [({ args }) => ({
    stdout: args.includes(":(glob)src/**") ? "" : `:100644 100644 ${"a".repeat(40)} ${"b".repeat(40)} M\0state.md\0`,
  })] }]).exec;
  const io = { git, gitInput: async () => "c".repeat(40) };
  const ordinary = { command: ["lint"], mode: "files", inputs: ["src/**"] };
  const request: CheckRequest = { form: { kind: "increment" } };
  const resolved = { scope: { kind: "changed" as const }, base: "a".repeat(40), tree: "b".repeat(40) };
  const baseline = await resolveCheckSelection(io, "/repo", CheckDeclarationSchema.parse({ checks: { ordinary } }),
    request, resolved, "checks.yml");
  const extended = await resolveCheckSelection(io, "/repo", CheckDeclarationSchema.parse({ checks: {
    ordinary, selected: { command: ["lint"], mode: "selection", inputs: ["**"] },
  } }), request, resolved, "checks.yml");
  expect(baseline.widened).toBe(true);
  expect(extended).toEqual(baseline);
  expect(extended.own.has("selected")).toBe(false);
});
