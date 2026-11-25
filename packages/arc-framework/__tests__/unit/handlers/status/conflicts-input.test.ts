/** Conflict status is one exclusive mode of the composite command. */
import { expect, it } from "vitest";
import { StatusCommandInputSchema } from "../../../../src/handlers/status/input.js";
import { handleStatus } from "../../../../src/handlers/status.js";
import { runHandlerAt } from "../../../helpers/handler.js";

it.each([{ slug: "demo" }, { user: true }, { project: true }, { sessionInit: true }, { sessionHandoff: true }, { recover: true }])("rejects another status mode alongside conflicts: %j", async mode => {
  const input = { conflicts: true, json: true, ...mode };
  const parsed = StatusCommandInputSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  if (parsed.success) throw new Error("Expected exclusive modes to refuse");
  expect(parsed.error.issues.map(issue => issue.message).join(" ")).toMatch(/--conflicts.*mutually exclusive/u);
  const { slug, ...options } = { slug: undefined, ...input };
  const result = await runHandlerAt(process.cwd(), () => handleStatus(slug, options));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/--conflicts.*mutually exclusive/u);
});
