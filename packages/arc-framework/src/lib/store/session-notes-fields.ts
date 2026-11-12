/** Semantic session fields decoded from workspace notes without exposing raw state parsers. */

import { extractField, stripInlineCode } from "./kinds/meta/line-reading.js";
import { stripHtmlComments } from "../user-sync/parser.js";

/** Authored session inputs retained by the workspace notes format. */
export interface SessionNotesFields {
  sessionType: string | null;
  commitAtHandoff: string | null;
}

/** Read visible session tokens through the same field grammar as metadata import. */
export function readSessionNotesFields(content: string): SessionNotesFields {
  const visible = stripHtmlComments(content);
  return { sessionType: token(extractField(visible, "Session Type")),
    commitAtHandoff: token(extractField(visible, "Commit at Handoff")) };
}

function token(value: string | null): string | null {
  const stripped = value === null ? null : stripInlineCode(value).trim();
  return stripped === "[none]" || stripped === "" ? null : stripped;
}
