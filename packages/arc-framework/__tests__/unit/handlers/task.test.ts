/** Task reports retain store diagnostics and executable recovery through the real terminal boundary. */
import { afterEach, expect, it, vi } from "vitest";
import { renderTaskClose, renderTaskDefer } from "../../../src/handlers/task.js";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it.each([
  { name: "close", render: renderTaskClose },
  { name: "defer", render: renderTaskDefer },
])("renders the store code and executable repair for $name", ({ render }) => {
  process.exitCode = undefined;
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const refusal = StoreRefusalSchema.parse({ code: "record-malformed", class: "recoverable",
    reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "demo" })),
    rule: "metadata", condition: "The stored record is malformed.",
    remedy: { text: "Repair the named record.", argv: ["arc", "status", "--json"] } });
  render({ status: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy, refusal });
  const output = [...stdout.mock.calls, ...stderr.mock.calls].map(([chunk]) => String(chunk)).join("");
  expect(output).toContain("record-malformed: The stored record is malformed.");
  expect(output).toContain("Repair the named record.");
  expect(output).toContain("arc status --json");
  expect(process.exitCode).toBe(1);
});
