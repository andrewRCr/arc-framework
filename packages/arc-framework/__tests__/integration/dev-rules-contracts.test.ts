import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

describe.each([
  { copy: "shipped", base: "packages/arc-framework/arc", quickReference: "QUICK-REFERENCE.template.md" },
  { copy: "installed", base: ".arc", quickReference: "QUICK-REFERENCE.md" },
])("$copy development rules", ({ base, quickReference }) => {
  const read = (path: string): Promise<string> => readFile(resolve(root, base, path), "utf8");
  const rules = (): Promise<string> => read("system/rules/DEV-RULES.ARC.md");

  it("routes to a live unit's inbound list only when its lifecycle admits the concern", async () => {
    const row = (await rules()).match(/^\| Another WU's, live .+$/mu)?.[0] ?? "";
    expect(row).toMatch(/\[arc-methods-rdw\]/u);
    expect(row).toMatch(/(?:if|when)\b[^|]*\badmit\w*\b[^|]*\binbound\b[^|]*\bmessage\b/iu);
  });

  it("bases inline routing on record edit rights and allows planning before the work branch exists", async () => {
    const row = (await rules()).match(/^\| The current WU's own .+$/mu)?.[0] ?? "";
    expect.soft(row).toMatch(/edit rights/u);
    expect.soft(row).not.toMatch(/\bbranch\b/u);

    const brief = await read("reference/briefs/AGENT-BRIEF.ARC.md");
    const definition = brief.match(/^- \*\*Work unit \(WU\):\*\*.+(?:\n {2}.+)*/mu)?.[0] ?? "";
    expect(definition).toMatch(/branch[^.]*activat|activat[^.]*branch/u);
  });

  it("allows fragment-only links and bars paths into fixed as well as movable projections", async () => {
    const section = (await rules()).split("### `.arc/` artifact references")[1]?.split("\n### ")[0] ?? "";
    expect.soft(section).toMatch(/projected Markdown[^.]*projected root[^.]*\bfixed\b[^.]*backticked\s+filename/iu);
    expect.soft(section).toMatch(/local links?[^.]*\bpaths?\b[^.]*outside (?:every|all) projected roots?/iu);
    expect.soft(section).toMatch(/\b(?:use|allow|permit) fragment-only links?|fragment-only links?\s+(?:may|can|are allowed|are permitted)\b/iu);
    expect.soft(section).toMatch(/relative links?[^.]*fixed records?[^.]*outside (?:every|all) projected roots?/iu);
    expect(section).toMatch(/movable record:\*\* no relative-path links/iu);
  });

  it("requires a commit before task close only for tracked changes", async () => {
    const text = await rules();
    const accuracy = text.split("**Task list accuracy:**")[1]?.split("\n\n")[0] ?? "";
    expect.soft(accuracy).toMatch(/(?:if|when)[^.]*tracked files?[^.]*\bcommit\b/iu);
    expect.soft(accuracy).toMatch(/no tracked (?:changes?|files?)[^.]*`arc task close --state-only`/iu);

    const atomicity = text.split("### Atomicity")[1]?.split("\n---")[0] ?? "";
    expect.soft(atomicity).toMatch(/tracked (?:changes?|files?)[^.]*\bcommit\b/iu);

    const reference = await read(`reference/${quickReference}`);
    const close = reference.match(/(?:^# .*\n)+(?=arc task close \[)/mu)?.[0] ?? "";
    expect.soft(close).toMatch(/tracked changes?[^\n]*commit|commit[^\n]*tracked changes?/iu);
    expect(close).toMatch(/no tracked changes?[^\n]*\b(?:directly|without a commit)\b/iu);
  });

  it("limits ceremony timing to authored meta content and lets task close maintain capture links", async () => {
    const timing = (await rules()).split("**Meta-file timing:**")[1]?.split("\n\n")[0] ?? "";
    expect.soft(timing).toMatch(/(?:edit|chang)\w*[^.]*meta[^.]*Markdown[^.]*ceremon/iu);
    expect(timing).toMatch(/`arc task close`[^.]*capture links/iu);
  });
});
