/** Golden migration coverage over the repository's nine live retirement records. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { enumerateReferenceTransitions } from "../../src/lib/work-unit/reference-reconcile.js";
import { queryRetirementDisposition } from "../../src/lib/work-unit/retirement-disposition-query.js";
import {
  validateRetirementRecordEnumeration,
  type RetirementRecordEnumerationResult,
} from "../../src/lib/work-unit/retirement-record-enumeration.js";
import {
  EXCLUDED_PARK_ORACLE,
  TERMINAL_TRANSITION_ORACLE,
} from "../fixtures/transition-record-migration/semantic-oracle.js";

const LEGACY_FIXTURE_DIRECTORY = fileURLToPath(new URL(
  "../fixtures/transition-record-migration/legacy",
  import.meta.url,
));

async function loadLegacyEnumeration(): Promise<RetirementRecordEnumerationResult> {
  const filenames = (await readdir(LEGACY_FIXTURE_DIRECTORY)).sort();
  return validateRetirementRecordEnumeration(await Promise.all(filenames.map(async (filename) => ({
    filename,
    mode: "100644",
    type: "blob",
    content: await readFile(`${LEGACY_FIXTURE_DIRECTORY}/${filename}`, "utf8"),
  }))));
}

function semanticAnswer(result: ReturnType<typeof queryRetirementDisposition>): unknown {
  if (result.status === "unique") return { status: result.status, disposition: result.disposition };
  if (result.status === "unmapped-dependent") return { status: result.status };
  return result;
}

describe("live transition record migration fixture", () => {
  it("decodes exactly eight terminal decisions and keeps the park receipt explicit", async () => {
    const enumeration = await loadLegacyEnumeration();
    expect(enumeration.status).toBe("valid");
    if (enumeration.status !== "valid") return;

    const inventory = enumeration.records.map(({ id, record }) => {
      if (record.kind === "v3-decomposition-receipt") {
        return {
          receiptFilename: `${id.replace(":", "-")}.json`,
          origin: record.value.prepared.completedMap.machine.source.origin,
          kind: "decompose",
          successors: record.value.prepared.completedMap.authoring.destinations
            .filter((destination) => destination.kind === "new-member")
            .map(({ slug }) => slug),
        };
      }
      if (record.kind !== "receipt" || record.value.subject.kind !== "work-unit") return null;
      return {
        receiptFilename: `${id.replace(":", "-")}.json`,
        origin: record.value.subject.name,
        kind: record.value.transition,
        successors: record.value.result.kind === "rename" ? [record.value.result.targetSlug] : [],
      };
    }).filter((entry) => entry !== null).sort((left, right) => left.origin.localeCompare(right.origin));
    const expected = [
      ...TERMINAL_TRANSITION_ORACLE.map(({ receiptFilename, origin, kind, successors }) => ({
        receiptFilename,
        origin,
        kind,
        successors: [...successors],
      })),
      { ...EXCLUDED_PARK_ORACLE, successors: [] },
    ].sort((left, right) => left.origin.localeCompare(right.origin));

    expect(inventory).toEqual(expected);
  });

  it("freezes every terminal disposition answer without sealing vocabulary", async () => {
    const enumeration = await loadLegacyEnumeration();
    for (const transition of TERMINAL_TRANSITION_ORACLE) {
      for (const query of transition.queries) {
        expect(semanticAnswer(queryRetirementDisposition(enumeration, {
          retiredSubject: transition.origin,
          dependentSlug: query.dependent,
        })), `${transition.origin}:${query.dependent}`).toEqual(query.answer);
      }
    }
  });

  it("freezes the eight terminal reference projections and excludes park", async () => {
    const projected = enumerateReferenceTransitions(await loadLegacyEnumeration());
    expect(projected.status).toBe("valid");
    if (projected.status !== "valid") return;

    expect([...projected.transitions].sort((left, right) => left.subject.localeCompare(right.subject)))
      .toEqual(TERMINAL_TRANSITION_ORACLE
        .map(({ reference }) => reference)
        .sort((left, right) => left.subject.localeCompare(right.subject)));
    expect(projected.transitions.some(({ subject }) => subject === EXCLUDED_PARK_ORACLE.origin)).toBe(false);
  });
});
