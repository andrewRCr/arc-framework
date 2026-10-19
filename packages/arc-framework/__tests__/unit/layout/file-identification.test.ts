/** File inverse follows projection and keeps ambiguous directory roots out of the store classifier. */
import { expect, it } from "vitest";
import { identifyArcFileAddress } from "../../../src/lib/layout/file-identification.js";
import { resolveArcPath } from "../../../src/lib/layout/projection.js";
import { ArcLayoutAddressSchema } from "../../../src/lib/layout/schema.js";
import { classifyStoreAddress } from "../../../src/lib/store/target-classification.js";
it.each([
  { kind: "work-unit-artifact", placement: { kind: "active", scope: { kind: "project" } }, slug: "demo", artifact: "meta" },
  { kind: "work-unit-artifact", placement: { kind: "completed", quarter: "2026-q4", sequence: "03" }, slug: "demo", artifact: "tasks" },
  { kind: "candidate-record", slug: "demo" }, { kind: "integration-boundary-record", slug: "demo" }, { kind: "transition-record", origin: "former" },
  { kind: "editor-document", schema: "tasks" }, { kind: "inbox", scope: { kind: "project" } }, { kind: "inbox", scope: { kind: "identity", identity: "alice" } },
  { kind: "user-document", identity: "alice", document: { kind: "working-memory" } }, { kind: "user-document", identity: "alice", document: { kind: "session-notes", workUnit: "demo" } },
  { kind: "project-document", document: "roadmap" }, { kind: "cohort-document", cohort: ["core"], placement: { kind: "planned" } },
  { kind: "cohort-document", cohort: ["core"], placement: { kind: "completed", quarter: "2026-q4", sequence: "03", closeout: "leaf" } },
])("round-trips the projected file address %#", (input) => {
  const address = ArcLayoutAddressSchema.parse(input), path = resolveArcPath(address);
  expect(identifyArcFileAddress(path)).toEqual(address);
});
it("classifies a work-unit meta and entry lists, and excludes directories and code", () => {
  const meta = identifyArcFileAddress(".arc/active/meta-demo.md");
  expect(meta).not.toBeNull(); if (meta === null) throw new Error("Expected meta");
  expect(classifyStoreAddress(meta)).toEqual({ kind: "work-item/meta", workItem: "demo", entryList: false });
  const inbox = identifyArcFileAddress(".arc/user/alice/USER-INBOX.md"); if (inbox === null) throw new Error("Expected inbox");
  expect(classifyStoreAddress(inbox)).toEqual({ kind: "personal/inbox", identity: "alice", entryList: true });
  expect(identifyArcFileAddress(".arc/active")).toBeNull(); expect(identifyArcFileAddress("src/app.ts")).toBeNull();
});
