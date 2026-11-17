/** A personal record is projectable only where its identity's view lays it, never at a side-file path. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { projectableRecord } from "../../../../src/lib/store/projection/desired-paths.js";

const andrew = SlugSchema.parse("andrew");
const scratch = (key: string, name = "andrew") => RecordReferenceSchema.parse({ kind: "personal/document",
  owner: { type: "person", name }, key });

it.each(["scratch/.DS_Store", "scratch/notes.md~", "scratch/._notes.md", "scratch/Thumbs.db"])(
  "answers false for a personal record stored at the side-file path %s", key => {
    expect(projectableRecord(andrew, scratch(key))).toBe(false);
  });

it("answers true for the identity's own scratch document and false for another identity's", () => {
  expect(projectableRecord(andrew, scratch("scratch/notes.md"))).toBe(true);
  expect(projectableRecord(andrew, scratch("scratch/notes.md", "bob"))).toBe(false);
});
