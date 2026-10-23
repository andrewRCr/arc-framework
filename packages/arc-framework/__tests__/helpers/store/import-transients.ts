/** Transient identity refs an import re-homes, seeded into an import fixture's code repository. */
import type { z } from "zod";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { hashBlob, writeTreeCommit } from "../../../src/lib/errand/ref-tree.js";
import type { importFixture } from "./import-fixture.js";

export type TransientIdentityRecord = z.input<typeof TransientIdentityRecordSchema>;

const timestamp = "2026-01-01T00:00:00.000Z";

/** Fields every seeded identity record shares. */
export const transientCommon = { version: 3 as const, claimId: "1".repeat(32), createdAt: timestamp, updatedAt: timestamp };

/** One open Errand with a description origin. */
export const ordinaryErrand: TransientIdentityRecord = { ...transientCommon, kind: "errand", purpose: "errand", slug: "example",
  branch: "chore/example", intent: "Keep this intent", origin: "description", originEntry: null, state: "open", savedHead: null,
  changeRequest: null };

/** The importing person's transient identity ref. */
export const transientSourceRef = "refs/arc/user/andrew/errands";

/** Where the import keeps the source tips it re-homed until cleanup ends. */
export const keptPrefix = "refs/arc/tmp/migrate/import/kept/";

/** Write the records as a person's transient identity ref's tree, creating each ordinary Errand's branch. */
export async function seedTransients(h: Awaited<ReturnType<typeof importFixture>>, records: TransientIdentityRecord[],
  identity = "andrew"): Promise<string> {
  const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity };
  const entries = new Map<string, string>();
  for (const record of records) {
    entries.set(record.slug, await hashBlob(io.execInput, serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse(record))));
    if (record.kind === "errand" && record.purpose === "errand" && record.branch) await h.git("git", ["branch", record.branch]);
  }
  return writeTreeCommit(io, entries, "Seed transient identities", [], null);
}
