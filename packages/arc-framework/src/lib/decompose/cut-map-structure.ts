/** Structural diagnostics that distinguish unfilled author slots. */
import type { z } from "zod";
import type { CutMapIssue } from "./cut-map-issues.js";
function valueAtPath(input: unknown, path: PropertyKey[]): unknown {
  let value = input;
  for (const part of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

function formatPath(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

/** Classify the first structural failure at its nearest author slot. */
export function cutStructuralIssue(input: unknown, error: z.ZodError): CutMapIssue {
  const first = error.issues[0];
  const path = first?.path ?? [];
  for (let length = path.length; length >= 0; length -= 1) {
    const candidatePath = path.slice(0, length);
    const value = valueAtPath(input, candidatePath);
    if (typeof value === "object" && value !== null
      && (value as { status?: unknown }).status === "author") {
      const locus = formatPath(candidatePath);
      return {
        code: "incomplete-authoring",
        path: locus,
        message: `Replace the author slot at ${locus} with a complete closed value.`,
      };
    }
  }
  return {
    code: "invalid-structure",
    path: formatPath(path),
    message: first?.message ?? "The completed cut map is not structurally valid.",
  };
}

