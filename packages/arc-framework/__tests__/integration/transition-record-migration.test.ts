/** Golden coverage over the repository's eight live lean transition records. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { enumerateTransitionReferenceTransitions } from "../../src/lib/work-unit/reference-reconcile.js";
import {
  validateTransitionRecordEnumeration,
  type TransitionRecordEnumerationResult,
} from "../../src/lib/work-unit/transition-record-enumeration.js";
import { queryTransitionDisposition } from "../../src/lib/work-unit/transition-disposition-query.js";
import { parseTransitionRecord, serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { TERMINAL_TRANSITION_ORACLE } from "../fixtures/transition-record-migration/semantic-oracle.js";

const REPOSITORY_TRANSITION_DIRECTORY = fileURLToPath(new URL(
  "../../../../.arc/system/.internal/transitions",
  import.meta.url,
));

async function loadTransitionEnumeration(): Promise<TransitionRecordEnumerationResult> {
  const filenames = (await readdir(REPOSITORY_TRANSITION_DIRECTORY)).sort();
  return validateTransitionRecordEnumeration(await Promise.all(filenames.map(async (filename) => ({
    filename,
    mode: "100644",
    type: "blob",
    content: await readFile(`${REPOSITORY_TRANSITION_DIRECTORY}/${filename}`),
  }))));
}

describe("live transition records", () => {
  it("preserves every terminal disposition and reference answer", async () => {
    const enumeration = await loadTransitionEnumeration();
    for (const transition of TERMINAL_TRANSITION_ORACLE) {
      for (const query of transition.queries) {
        expect(queryTransitionDisposition(enumeration, {
          origin: transition.origin,
          dependentSlug: query.dependent,
        }), `${transition.origin}:${query.dependent}`).toEqual(query.answer);
      }
    }

    const projected = enumerateTransitionReferenceTransitions(enumeration);
    expect(projected.status).toBe("valid");
    if (projected.status !== "valid") return;
    expect([...projected.transitions].sort((left, right) => left.subject.localeCompare(right.subject)))
      .toEqual(TERMINAL_TRANSITION_ORACLE
        .map(({ reference }) => reference)
        .sort((left, right) => left.subject.localeCompare(right.subject)));
  });

  it("materializes exactly eight canonical origin-keyed records", async () => {
    const filenames = (await readdir(REPOSITORY_TRANSITION_DIRECTORY)).sort();
    expect(filenames).toEqual(TERMINAL_TRANSITION_ORACLE
      .map(({ origin }) => `${origin}.json`)
      .sort());
    const contents = await Promise.all(filenames.map(async (filename) => ({
      filename,
      content: await readFile(`${REPOSITORY_TRANSITION_DIRECTORY}/${filename}`),
    })));
    const enumeration = await loadTransitionEnumeration();
    expect(enumeration.status).toBe("valid");
    if (enumeration.status !== "valid") return;
    expect(enumeration.groups).toHaveLength(8);
    expect(enumeration.groups.map(({ origin, records }) => {
      expect(records).toHaveLength(1);
      const record = records[0];
      if (record === undefined) throw new Error(`missing record for ${origin}`);
      return { origin, kind: record.kind, successors: record.successors, edges: record.edges };
    })).toEqual(TERMINAL_TRANSITION_ORACLE
      .map(({ origin, kind, successors }) => ({ origin, kind, successors: [...successors], edges: [] }))
      .sort((left, right) => left.origin.localeCompare(right.origin)));
    for (const { filename, content } of contents) {
      const text = content.toString("utf8");
      const record = parseTransitionRecord(text);
      expect(record, filename).not.toBeNull();
      expect(record === null ? null : serializeTransitionRecord(record), filename).toBe(text);
    }
  });
});
