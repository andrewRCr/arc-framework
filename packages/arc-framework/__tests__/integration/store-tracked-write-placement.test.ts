/** Meta creation placement is derived from the tolerant field projection and layout authority. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, trackedDigest } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "stub", lifecycleAction: "stub" };
async function exists(path: string) { return access(path).then(() => true, () => false); }

describe("tracked meta placement", () => {
  it.each(["", "[none]", "—", "group", "group/subgroup"])("creates a backlog meta from Cohort %s without validating unrelated fields", async (cohort) => {
    const h = await trackedWriteFixture();
    const reference = h.reference("work-item/meta");
    const content = makeMetaFixture("example", { cohort: ["", "[none]", "—"].includes(cohort) ? null : cohort }).replace(/(- \*\*Cohort:\*\*)[^\n]*/u, `$1 ${cohort}`).replace("`Active`", "`unrecognized`");
    const placement = { kind: "backlog" as const, commitment: "planned" as const };
    const path = join(h.root, resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: reference.owner.name,
      placement: { ...placement, cohort: ["", "[none]", "—"].includes(cohort) ? [] : cohort.split("/").map((name) => SlugSchema.parse(name)) } }));
    await expect(h.store.write({ action: "put", reference, content, expected: null, placement, provenance })).resolves.toMatchObject({ status: "ok" });
    expect(await readFile(path, "utf8")).toBe(content);
  });

  it("creates an active meta flat in active without requiring a Git commit", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("work-item/meta");
    const content = makeMetaFixture("example");
    await expect(h.store.write({ action: "put", reference, content, expected: null,
      placement: { kind: "active" }, provenance })).resolves.toMatchObject({ status: "ok", result: { version: trackedDigest(content) } });
    expect(await readFile(join(h.root, ".arc/active/meta-example.md"), "utf8")).toBe(content);
  });

  it.each(["a/b/c", "Not-A-Slug", "broken-projection"])("refuses malformed creation %s and lands the corrected meta", async (bad) => {
    const h = await trackedWriteFixture();
    const reference = h.reference("work-item/meta");
    const valid = makeMetaFixture("example", { cohort: "group" });
    const content = bad === "broken-projection" ? valid.replace(/^\| `Active`[^\n]*\n/mu, "") : makeMetaFixture("example", { cohort: bad });
    const write = { action: "put" as const, reference, content, expected: null, placement: { kind: "backlog" as const, commitment: "planned" as const }, provenance };
    await expect(h.store.write(write)).resolves.toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: expect.stringMatching(/Cohort|meta/iu) } });
    expect(await exists(join(h.root, ".arc/backlog/planned/group/example/meta-example.md"))).toBe(false);
    success(await h.store.write({ ...write, content: valid }));
    expect(await readFile(join(h.root, ".arc/backlog/planned/group/example/meta-example.md"), "utf8")).toBe(valid);
  });

  it.each(["move", "rename", "links"] as const)("refuses unsupported %s before replacing any bytes", async (kind) => {
    const h = await trackedWriteFixture();
    const reference = h.reference("work-item/meta");
    const path = join(h.root, ".arc/active/meta-example.md");
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    await writeFile(path, "original");
    const renamed = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, uid: "12345678-1234-4234-9234-123456789012" } });
    const input = { action: "put" as const, reference: kind === "rename" ? renamed : reference, expected: trackedDigest("original"), content: "replacement",
      placement: kind === "move" ? { kind: "backlog" as const, commitment: "planned" as const } : { kind: "active" as const },
      ...(kind === "links" ? { links: {} } : {}), provenance };
    expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal",
      case: kind === "move" ? "placement-move" : kind === "links" ? "links-write" : "rename", remedy: { text: expect.any(String) } } });
    expect(await readFile(path, "utf8")).toBe("original");
  });

  it("refuses completed creation with the archive remedy", async () => {
    const h = await trackedWriteFixture();
    const input = { action: "put" as const, reference: h.reference("work-item/meta"), content: makeMetaFixture("example"), expected: null,
      placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance };
    await expect(h.store.write(input)).resolves.toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "completed-create", remedy: { text: expect.stringContaining("archive") } } });
  });
});
