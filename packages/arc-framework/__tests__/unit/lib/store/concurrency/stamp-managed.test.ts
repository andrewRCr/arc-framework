import { describe, expect, it } from "vitest";
import { stampEntryIds } from "../../../../../src/lib/store/concurrency/stamp.js";

describe("kind-managed ID placement", () => {
  it("keeps the ID with WU_Target rather than a prose descriptor", () => {
    const config = { shape: "heading" as const, sections: ["Inbox"], managedFields: ["Created", "WU_Target"] };
    const text = '## Inbox\n\n### **Title**\n- _Created:_ `2026-01-01`\n- _WU_Target:_ `some-unit`\n\n- _Decision:_ `token` explains something\n';
    expect(stampEntryIds(text, config, () => 0)).toContain('- _WU_Target:_ `some-unit`\n- _Id:_ `00000000`\n\n- _Decision:_');
  });
  it("keeps a wrapped trigger whole", () => {
    const text = '## Memories\n\n**Title:**\n_Remove when: this wraps\nonto the next line._\n\nBody\n';
    expect(stampEntryIds(text, { shape: "field-header", sections: ["Memories"] }, () => 0))
      .toContain('onto the next line._\n_Id:_ `00000000`');
  });
});

it("places an identity below a canonical execute disposition and leaves its mark readable", async () => {
  const { hasExecuteBoundDisposition } = await import("../../../../../src/lib/user-sync/inbox-writer.js");
  const raw = '### **Title**\n\n- _Disposition:_ `execute-bound`\n\n- _Why:_ prose';
  const stamped = stampEntryIds(`## Inbox\n${raw}\n`, { shape: "heading", sections: ["Inbox"], managedFields: [] }, () => 0);
  expect(stamped).toContain('- _Disposition:_ `execute-bound`\n- _Id:_ `00000000`');
  expect(hasExecuteBoundDisposition(stamped.slice(stamped.indexOf("###")))).toBe(true);
});

it("ignores prose descriptors when a kind declares no managed fields", () => {
  const stamped = stampEntryIds('## Inbox\n### **Title**\n\n- _Why:_ `token` prose\n', { shape: "heading", sections: ["Inbox"], managedFields: [] }, () => 0);
  expect(stamped).toContain('### **Title**\n- _Id:_ `00000000`\n\n- _Why:_');
});
