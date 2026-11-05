import { describe, expect, it } from "vitest";
import { adrNumber, parseStatusSection, resolveBaseVersion, runAdrCheck, localCalendarDate, type AdrReader, checkNumbers, checkStatuses, selectExaminedAdrs, type AdrRecord, type AdrEntry } from "../../../src/scripts/check-adr-records.js";

const path = (name: string): string => `.arc/reference/adr/adr-${name}.md`;
const entry = (name: string, objectId = name): AdrEntry => ({ path: path(name), number: Number(/^(\d+)/u.exec(name)?.[1]) || null, objectId });

describe("ADR Status sections", () => {
  it.each(["Proposed.", "**pRoPoSeD**", "_PROPOSED_;", "***Proposed***:"])("recognizes %s", line => {
    expect(parseStatusSection(`# Record\n\n## Status\n\n${line}\n\n## Context\nBody`)).toEqual({
      line, text: line, proposed: true,
    });
  });
  it.each(["Accepted (2026-10-10), where …", "Accepted · Amended 2026-03-05 …", "Superseded by ADR-029.", "Deprecated - …"])("keeps %s distinct from Proposed", line => {
    expect(parseStatusSection(`## Status\n${line}`)?.proposed).toBe(false);
  });
  it("retains the complete section but judges only its first nonblank line", () => {
    expect(parseStatusSection("## Status\n\nAccepted.\n\nProposed later.\n### Note\nKeep this.\n# Next\nSkip")).toEqual({
      line: "Accepted.", text: "Accepted.\n\nProposed later.\n### Note\nKeep this.", proposed: false,
    });
  });
  it.each(["```md\n## Status\nProposed\n```", "~~~~\n## Status\nProposed\n~~~\nStill fenced\n~~~~"])("ignores fenced headings", fence => {
    expect(parseStatusSection(`${fence}\n## Status\nAccepted\n## Context\nBody`)?.line).toBe("Accepted");
  });
  it("ignores fenced section endings and takes the first real Status section", () => {
    expect(parseStatusSection("## Status\nProposed\n```\n## Context\n```\n## Status\nAccepted")?.text).toBe("Proposed\n```\n## Context\n```");
  });
  it.each(["# Record\nNo status", "## Status\n\n## Context\nBody", "## status\nProposed"])("treats absent or empty sections as missing", content => {
    expect(parseStatusSection(content)).toBeNull();
  });
});

describe("ADR numbers and base versions", () => {
  it("compares digit runs as integers and leaves unnumbered names out", () => {
    expect(adrNumber(path("007-record"))).toBe(7);
    expect(adrNumber(path("7-record"))).toBe(7);
    expect(adrNumber(path("unnumbered"))).toBeNull();
  });
  it("prefers the same path at the base", () => {
    const original = entry("001-original", "old");
    const edited = { ...original, objectId: "new" };
    expect(resolveBaseVersion(edited, [edited], [original])).toEqual(original);
  });
  it("resolves a single removed same-number path as a rename", () => {
    const original = entry("001-original");
    const renamed = entry("1-renamed");
    expect(resolveBaseVersion(renamed, [renamed], [original])).toEqual(original);
  });
  it("does not borrow a same-number base path still present in the tree", () => {
    const original = entry("001-original");
    const collision = entry("001-collision");
    expect(resolveBaseVersion(collision, [original, collision], [original])).toBeUndefined();
  });
  it("does not let two added paths claim one removed path", () => {
    const original = entry("001-original");
    const added = [entry("001-a"), entry("001-b")];
    for (const candidate of added) expect(resolveBaseVersion(candidate, added, [original])).toBeUndefined();
  });
  it("does not choose among two removed same-number base paths", () => {
    const renamed = entry("001-renamed");
    expect(resolveBaseVersion(renamed, [renamed], [entry("001-a"), entry("001-b")])).toBeUndefined();
  });
  it("never matches unnumbered names as renames", () => {
    const renamed = entry("new");
    expect(resolveBaseVersion(renamed, [renamed], [entry("old")])).toBeUndefined();
  });
});

const record = (name: string, status: string | null, objectId = `${name}:${status}`): AdrRecord => ({
  ...entry(name, objectId), status: status === null ? null : parseStatusSection(`## Status\n${status}`),
});
const today = "2026-11-04";
const accepted = "Accepted (2026-10-10).\n\nOriginal realization note.";
const statusCheck = (tree: AdrRecord[], base: AdrRecord[] | undefined = [], paths = tree.map(item => item.path)) =>
  checkStatuses({ tree, base, paths, today, baseLabel: "abc1234" });

describe("ADR status rules", () => {
  it("rejects a new Proposed ADR with a dated acceptance remedy", () => {
    const added = record("040-new", "Proposed.");
    expect(statusCheck([added])).toEqual([
      `${added.path} is a new ADR reading Proposed. A new ADR merges Accepted: set its Status to "Accepted (${today})" in this change before it merges.`,
    ]);
  });
  it("rejects a new ADR with no Status section", () => {
    const added = record("040-new", null);
    expect(statusCheck([added])).toEqual([
      `${added.path} is a new ADR with no Status section. Add "## Status" reading "Accepted (${today})" in this change before it merges.`,
    ]);
  });
  it.each(["Accepted (2026-11-04)", "Superseded by ADR-041", "Deprecated - retired"])("admits a new non-Proposed ADR: %s", status => {
    expect(statusCheck([record("040-new", status)])).toEqual([]);
  });
  it.each(["Proposed.", null])("restores the exact base Status section after %s", status => {
    const original = record("001-original", accepted);
    const edited = record("001-original", status);
    const reason = status === null ? "removes its Status section" : "returns an ADR to Proposed";
    expect(statusCheck([edited], [original])).toEqual([
      `${edited.path} ${reason}. Restore the Status section of its base version (${original.path} at abc1234):\n  Accepted (2026-10-10).\n  \n  Original realization note.`,
    ]);
  });
  it("names a renamed record's base path in its restore remedy", () => {
    const original = record("001-original", accepted);
    const renamed = record("001-renamed", null);
    expect(statusCheck([renamed], [original])[0]).toContain(`(${original.path} at abc1234):`);
  });
  it.each(["Accepted (2026-11-04)", "Superseded by ADR-041", accepted])("admits non-Proposed edits and restored Status sections: %s", status => {
    expect(statusCheck([record("001-original", status)], [record("001-original", accepted)])).toEqual([]);
  });
  it.each(["Proposed.", "Proposed.\n\nEdited notes.", "Accepted (2026-11-04)"])("keeps a base-Proposed ADR editable: %s", status => {
    expect(statusCheck([record("020-original", status)], [record("020-original", "Proposed.")])).toEqual([]);
  });
  it("keeps a renamed base-Proposed ADR editable", () => {
    expect(statusCheck([record("020-renamed", "Proposed.")], [record("020-original", "Proposed.")])).toEqual([]);
  });
  it("still refuses to remove a base-Proposed Status section", () => {
    expect(statusCheck([record("020-original", null)], [record("020-original", "Proposed.")])[0]).toContain("removes its Status section");
  });
  it.each([null, "Proposed."])("lets a missing base Status section constrain nothing: %s", status => {
    expect(statusCheck([record("001-original", status)], [record("001-original", null)])).toEqual([]);
  });
  it("treats a collision and a renumber as new records", () => {
    const original = record("020-original", "Proposed.");
    const collision = record("020-collision", "Proposed.");
    expect(statusCheck([original, collision], [original])[0]).toContain(`${collision.path} is a new ADR reading Proposed`);
    expect(statusCheck([record("041-renumbered", "Proposed.")], [original])[0]).toContain("is a new ADR reading Proposed");
  });
  it("examines only changed ADR arguments, including same-content renames", () => {
    const original = record("020-original", "Proposed.");
    const renamed = { ...original, path: path("020-renamed") };
    const added = record("040-new", "Proposed.");
    const outside = { ...added, path: "notes.md" };
    expect(selectExaminedAdrs([original, added, outside], [original], [original.path, outside.path])).toEqual([]);
    expect(selectExaminedAdrs([renamed], [original], [renamed.path])).toEqual([renamed]);
    expect(statusCheck([original], [original])).toEqual([]);
  });
  it("reports all failures in one result", () => {
    expect(statusCheck([record("040-one", "Proposed"), record("041-two", null)])).toHaveLength(2);
  });
  it("refuses without a base and gives both recovery routes verbatim", () => {
    expect(checkStatuses({ tree: [record("020-original", "Proposed")], base: undefined, paths: [], today, baseLabel: "" })).toEqual([
      "No base to compare ADRs against: the base branch did not resolve, or it has no single merge base with HEAD.\nMake the base branch resolvable (its upstream or local branch) and rerun, or name the merge base itself:\narc check run lint:adr:status --range <merge-base>",
    ]);
  });
});

describe("ADR number collisions", () => {
  it("names the added path and chooses above both trees' maximum number", () => {
    const original = entry("001-original");
    const added = entry("1-added");
    const result = checkNumbers([original, added, entry("039-high")], [original, entry("045-deleted")]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(original.path);
    expect(result[0]).toContain(`Renumber ${added.path} to ADR-046`);
    expect(result[0]).toContain("update the records that cite the renumbered ADR by number");
  });
  it("allows either record to be renumbered when both are added", () => {
    const result = checkNumbers([entry("001-a"), entry("001-b")], []);
    expect(result[0]).toContain("Renumber either added path to ADR-002");
    expect(result[0]).toContain(path("001-a"));
    expect(result[0]).toContain(path("001-b"));
  });
  it("states the first-parent rule without choosing a path when neither is added", () => {
    const records = [entry("001-a"), entry("001-b")];
    const result = checkNumbers(records, records);
    expect(result[0]).toContain("In a separate change, renumber every path except the one that landed first in the base branch's first-parent history to ADR-002");
    expect(result[0]).not.toContain(`Renumber ${records[0]?.path}`);
  });
  it("renumbers every added path when an existing record shares the number", () => {
    const original = entry("001-original");
    const result = checkNumbers([original, entry("001-a"), entry("001-b")], [original]);
    expect(result[0]).toContain(`Renumber ${path("001-a")} to ADR-002`);
    expect(result[0]).toContain(`Renumber ${path("001-b")} to ADR-003`);
  });
  it("allocates consecutive targets across several collisions", () => {
    const base = [entry("001-original"), entry("002-original")];
    const result = checkNumbers([...base, entry("001-added"), entry("002-added")], base);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain(`Renumber ${path("001-added")} to ADR-003`);
    expect(result[1]).toContain(`Renumber ${path("002-added")} to ADR-004`);
  });
  it("keeps one of several wholly new colliding records", () => {
    expect(checkNumbers([entry("001-a"), entry("001-b"), entry("001-c")], [])[0]).toContain("Renumber any 2 added paths to ADR-002, ADR-003");
  });
  it("still diagnoses collisions without a base, giving the rule and recovery route", () => {
    const result = checkNumbers([entry("001-a"), entry("001-b")]);
    expect(result[0]).toContain(path("001-a"));
    expect(result[0]).toContain(path("001-b"));
    expect(result[0]).toContain("the one this change adds");
    expect(result[0]).toContain("either when it adds both");
    expect(result[0]).toContain("first-parent history");
    expect(result[0]).toContain("Make the base branch resolvable and rerun");
    expect(result[0]).not.toContain("--range");
  });
  it("ignores names without a number and passes unique numbers even without a base", () => {
    expect(checkNumbers([entry("unnumbered"), entry("other"), entry("001-unique")])).toEqual([]);
  });
});

const environment = { ARC_CHECK_TREE: "tree", ARC_CHECK_BASE: "abcdef1234" };
const fakeReader = (base: AdrRecord[], tree: AdrRecord[]): AdrReader => ({
  list: revision => revision === environment.ARC_CHECK_TREE ? tree : base,
  read: (revision, path) => {
    const found = (revision === environment.ARC_CHECK_TREE ? tree : base).find(record => record.path === path);
    if (found === undefined) throw new Error(`Missing blob ${revision}:${path}`);
    return found.status === null ? "# No Status" : `## Status\n${found.status.text}`;
  },
});

describe("ADR check entry", () => {
  it.each([{ args: [] }, { args: ["other"] }])("rejects an unknown rule: $args", ({ args }) => {
    expect(runAdrCheck(args, {}, fakeReader([], []), today)).toMatchObject({ exitCode: 1, diagnostics: [expect.stringContaining("Usage:")] });
  });
  it.each(["status", "numbers"])("names the proper check when %s has no tree", rule => {
    expect(runAdrCheck([rule], {}, fakeReader([], []), today)).toEqual({
      exitCode: 1, diagnostics: [`ARC_CHECK_TREE is required. Run arc check run lint:adr:${rule}.`],
    });
  });
  it("fails with a reader's Git error", () => {
    const reader: AdrReader = { list: () => { throw new Error("fatal: bad tree object"); }, read: () => "" };
    expect(runAdrCheck(["numbers"], environment, reader, today)).toEqual({ exitCode: 1, diagnostics: ["fatal: bad tree object"] });
  });
  it("fails with a blob read error instead of judging missing content", () => {
    const reader: AdrReader = { list: () => [entry("040-new")], read: () => { throw new Error("fatal: missing blob"); } };
    expect(runAdrCheck(["status", path("040-new")], { ARC_CHECK_TREE: "tree", ARC_CHECK_BASE: "base" }, {
      ...reader, list: revision => revision === "base" ? [] : reader.list(revision),
    }, today)).toEqual({ exitCode: 1, diagnostics: ["fatal: missing blob"] });
  });
  it("routes status through the supplied revisions and local run date", () => {
    const added = record("040-new", "Proposed");
    expect(runAdrCheck(["status", added.path], environment, fakeReader([], [added]), today)).toEqual({
      exitCode: 1, diagnostics: statusCheck([added]),
    });
    const accepted = record("040-new", "Accepted");
    expect(runAdrCheck(["status", accepted.path], environment, fakeReader([], [accepted]), today)).toEqual({ exitCode: 0, diagnostics: [] });
  });
  it("reads Status sections only for examined ADRs and their base versions", () => {
    const base = [record("020-original", "Proposed"), record("001-unchanged", "Accepted")];
    const tree = [record("020-original", "Proposed\n\nUpdated"), base[1]!];
    const reader = fakeReader(base, tree);
    const selective: AdrReader = { ...reader, read: (revision, name) => {
      if (name !== path("020-original")) throw new Error("Unexamined contents must not be read");
      return reader.read(revision, name);
    } };
    expect(runAdrCheck(["status", ...tree.map(item => item.path), "notes.md"], environment, selective, today)).toEqual({ exitCode: 0, diagnostics: [] });
  });
  it("routes number checks without reading any contents", () => {
    const tree = [record("001-original", "Accepted"), record("001-added", "Accepted")];
    const reader: AdrReader = { ...fakeReader([tree[0]!], tree), read: () => { throw new Error("Names suffice"); } };
    const result = runAdrCheck(["numbers"], environment, reader, today);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(checkNumbers(tree, [tree[0]!]));
    expect(runAdrCheck(["numbers"], environment, fakeReader([], []), today)).toEqual({ exitCode: 0, diagnostics: [] });
  });
  it("refuses status without a base without attempting a Git read", () => {
    const reader: AdrReader = { list: () => { throw new Error("No read expected"); }, read: () => "" };
    expect(runAdrCheck(["status"], { ARC_CHECK_TREE: "tree" }, reader, today)).toEqual({
      exitCode: 1, diagnostics: checkStatuses({ tree: [], base: undefined, paths: [], today, baseLabel: "" }),
    });
  });
  it("dates the remedy by local fields instead of the UTC day", () => {
    const evening = new Date("2026-11-05T04:30:00Z");
    evening.getFullYear = () => 2026;
    evening.getMonth = () => 10;
    evening.getDate = () => 4;
    expect(localCalendarDate(evening)).toBe("2026-11-04");
  });
});
