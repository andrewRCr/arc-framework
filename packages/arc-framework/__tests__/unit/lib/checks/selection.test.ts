/** Check-level policy over established changed-input observations. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { selectCheckInputs } from "../../../../src/lib/checks/selection.js";
import type { CheckRequest } from "../../../../src/lib/checks/request.js";
const changedPath = { path: "src/a.ts", status: "M" as const, oldMode: "100644", newMode: "100644", oldBlob: "a".repeat(40), newBlob: "b".repeat(40) };
function selected({ own, widened = false, widen = true, ciOnly = false, request = { form: { kind: "gate", gate: "commit" } }, all = false }: {
  own: "changed" | "unchanged" | "unresolved"; widened?: boolean; widen?: boolean; ciOnly?: boolean; request?: CheckRequest; all?: boolean;
}) {
  const check = CheckDeclarationSchema.parse({ checks: { lint: { command: ["lint"], mode: "files", widen, ci_only: ciOnly } } }).checks.lint!;
  return selectCheckInputs({ id: "lint", check, request,
    resolved: { scope: { kind: all ? "all" : "changed" }, tree: "c".repeat(40), base: "HEAD" },
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
