/** Content-forming requests permit fixes; verification requests reject them. */
import { expect, it } from "vitest";
import { checkFixesAllowed } from "../../../../src/lib/checks/fixers.js";
import type { CheckRequest } from "../../../../src/lib/checks/request.js";

const cases: Array<[CheckRequest, boolean]> = [
  [{ form: { kind: "increment" } }, true],
  [{ form: { kind: "segment" } }, true],
  [{ form: { kind: "run", ids: ["format"] } }, true],
  [{ form: { kind: "pre-commit" } }, true],
  [{ form: { kind: "gate", gate: "merge" }, scope: { kind: "paths", paths: ["src/a.ts"] } }, true],
  [{ form: { kind: "gate", gate: "commit" }, scope: { kind: "changed" } }, false],
  [{ form: { kind: "gate", gate: "commit" }, scope: { kind: "staged" } }, false],
  [{ form: { kind: "gate", gate: "push" }, scope: { kind: "range" } }, false],
  [{ form: { kind: "gate", gate: "merge" }, scope: { kind: "all" } }, false],
  [{ form: { kind: "new-head", from: "HEAD" } }, false],
];
const ci: Array<[CheckRequest, boolean]> = cases.filter(([request]) => request.form.kind !== "pre-commit")
  .map(([request]) => [{ ...request, ci: true }, false]);
it.each([...cases, ...ci])("decides whether fixes apply for %j", (request, allowed) => {
  expect(checkFixesAllowed(request)).toBe(allowed);
});
