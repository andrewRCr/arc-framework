/** Production-shaped list fixtures over the public in-memory store boundary. */
import { createReferenceFixture } from "./store/reference-fixture.js";
import { seed } from "./store/suite-tools.js";
import { makeMetaFixture } from "./meta-fixture.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import type { InboxContext } from "../../src/lib/inbox/types.js";
import { ArchiveQuarterSchema, type WorkUnitState } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";

/** Independently owned reference store with deterministic move keys and IDs. */
export function createInboxHarness() {
  const fixture = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser ?? null } });
  let sequence = 0;
  const context: InboxContext = { store: fixture.store, identity: "test-user", now: () => new Date("2026-02-01T12:00:00Z"), random: () => (sequence++ + 100) / 0x100000000, key: () => `move-${sequence++}` };
  return {
    fixture, context,
    async inbox(list: "personal" | "project", entries = entry()) {
      const reference = fixture.reference(list === "personal" ? "personal/inbox" : "project-inbox/inbox");
      return seed(fixture, reference, `## ${list === "personal" ? "Work Unit" : "Inbox"}\n\n${entries}\n`);
    },
    async workUnit(suffix = "target", owner = "test-user", placement: "active" | "backlog" | "completed" = "active", entries = "", state: WorkUnitState = "Active") {
      const ref = fixture.reference("work-item/meta", suffix);
      const primary = await seed(fixture, ref, makeMetaFixture(ref.owner.name, { state: placement === "completed" ? "Shipped" : state, owner }), placement === "backlog" ? { kind: "backlog", commitment: "planned" } : placement === "completed" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") } : { kind: "active" });
      if (entries) await seed(fixture, recordReferences["work-item/inbound"](primary.reference.owner), `## Inbound\n\n${entries}\n`);
      return primary;
    },
    async errand(suffix = "errand", entries = "", completed = false) {
      const ref = fixture.reference("work-item/record", suffix);
      const content = JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: ref.owner.name, claimId: "a".repeat(32), createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", intent: "Concern", branch: `chore/${ref.owner.name}`, origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null, owner: "test-user" }));
      const primary = await seed(fixture, ref, content, completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") } : { kind: "active" });
      if (entries) await seed(fixture, recordReferences["work-item/description"](primary.reference.owner), `## Description\n\n${entries}\n`);
      return primary;
    },
  };
}
/** A canonical list entry, with stable ID and creation date. */
export function entry(id = "12345678", title = "Concern", prose = "Prose"): string {
  return `### **${title}**\n- _Created:_ \`2026-01-01\`\n- _Id:_ \`${id}\`\n\n${prose}`;
}
