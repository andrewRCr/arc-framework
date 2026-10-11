/** Request membership and kind share one cumulative deadline model. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { checkRequestDeadline, checkResultKind, selectRequestChecks } from "../../../../src/lib/checks/gates.js";
import type { CheckForm } from "../../../../src/lib/checks/request.js";
const checks = CheckDeclarationSchema.parse({ checks: {
  commit: { command: ["check"], gate: "commit" }, push: { command: ["check"], gate: "push" },
  files: { command: ["check"], gate: "push", mode: "files" }, merge: { command: ["check"], gate: "merge" }, manual: { command: ["check"] },
} }).checks;
it.each([
  { form: { kind: "gate", gate: "commit" }, ids: ["commit"] },
  { form: { kind: "gate", gate: "push" }, ids: ["commit", "push", "files"] },
  { form: { kind: "gate", gate: "merge" }, ids: ["commit", "push", "files", "merge"] },
  { form: { kind: "increment" }, ids: ["commit", "files"] },
  { form: { kind: "segment" }, ids: ["commit", "push", "files"] },
  { form: { kind: "new-head", from: "HEAD" }, ids: ["commit", "push", "files"] },
  { form: { kind: "pre-commit" }, ids: ["commit"] },
] satisfies { form: CheckForm; ids: string[] }[])("selects $ids for $form", ({ form, ids }) => {
  expect(selectRequestChecks(checks, form).map(([id]) => id)).toEqual(ids);
});
it("labels early files feedback separately from enforcement and gives named runs no deadline", () => {
  expect(checkResultKind({ kind: "increment" }, checks.commit!)).toBe("enforcement");
  expect(checkResultKind({ kind: "increment" }, checks.files!)).toBe("feedback");
  expect(checkResultKind({ kind: "segment" }, checks.files!)).toBe("enforcement");
  const named: CheckForm = { kind: "run", ids: ["manual", "commit"] };
  expect(checkRequestDeadline(named)).toBeUndefined();
  expect(selectRequestChecks(checks, named).map(([id]) => id)).toEqual(["commit", "manual"]);
  expect(checkResultKind(named, checks.commit!)).toBe("feedback");
  expect(checkResultKind(named, checks.manual!)).toBe("feedback");
});
