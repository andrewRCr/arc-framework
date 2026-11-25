/** Kind-owned grammar data, independent of registration and backend modules. */
import { PERSONAL_FIELDS } from "./entry-fields.js";
import type { EntryListConfig } from "../concurrency/entries.js";

/** The six entry kinds' section and managed-field declarations. */
export const ENTRY_CONFIGS = {
  "personal/inbox": { shape: "heading", sections: ["Errand", "Work Unit"], managedFields: PERSONAL_FIELDS },
  "personal/working-memory": { shape: "field-header", sections: ["Memories"], managedFields: ["Remove when"] },
  "project-inbox/inbox": { shape: "heading", sections: ["Inbox"], managedFields: ["Created"] },
  "work-item/inbound": { shape: "heading", sections: ["Inbound"], managedFields: ["Created", "Shapes", "Cites"] },
  "work-item/description": { shape: "heading", sections: ["Description"], managedFields: [...PERSONAL_FIELDS, "Cites"] },
  "personal/errand-queue": { shape: "heading", sections: ["Queue"], managedFields: ["Inbox", "Rank"] },
} as const satisfies Record<string, EntryListConfig>;
/** A kind with a declared entry grammar. */
export type EntryKind = keyof typeof ENTRY_CONFIGS;
