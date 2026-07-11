import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(directory, entry));
}

describe("PR-open lifecycle extensions", () => {
  it.each([
    [packageArc, "system/extensions/pre-pr-open.md", "pre-pr-open"],
    [packageArc, "system/extensions/post-pr-open.md", "post-pr-open"],
    [projectArc, "system/extensions/pre-pr-open.md", "pre-pr-open"],
    [projectArc, "system/extensions/post-pr-open.md", "post-pr-open"],
  ])("registers an inactive placeholder shell at %s/%s", async (base, relative, name) => {
    const content = await readFile(resolve(base, relative), "utf8");
    expect(content).toContain(`name: ${name}`);
    expect(content).toContain("active: false");
    expect(content).toContain(`[No extension configured]`);
    expect(content.match(/^## .*\.actions$/gmu)).toHaveLength(1);
  });

  it("removes the legacy hook from live product surfaces", async () => {
    const files = [
      ...await markdownFiles(packageArc),
      ...await markdownFiles(resolve(projectArc, "system")),
      ...await markdownFiles(resolve(projectArc, "reference")),
    ];
    const matches: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("pre-pr-review")) matches.push(file);
    }
    expect(matches).toEqual([]);
  });

  it("preserves independent Configurable update identities", async () => {
    const classification = await readFile(resolve(root, "packages/arc-framework/src/lib/classification.ts"), "utf8");
    expect(classification).toContain('"system/extensions/pre-pr-open.md"');
    expect(classification).toContain('"system/extensions/post-pr-open.md"');
  });

  it("places work-unit hooks on create, re-entry, and the stable final head", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const push = workflow.indexOf("Push the WU branch upstream");
    const preOpen = workflow.indexOf("Immediately before creation");
    const create = workflow.indexOf("gh pr create");
    const postOpen = workflow.indexOf("compose `openedChangeRequest");
    const finalHead = workflow.indexOf("At the zero-behind final head");
    const mergeInterlock = workflow.indexOf("`integration-interlock`", finalHead);
    expect(push).toBeLessThan(preOpen);
    expect(preOpen).toBeLessThan(create);
    expect(create).toBeLessThan(postOpen);
    expect(finalHead).toBeLessThan(mergeInterlock);
    expect(workflow.slice(finalHead, mergeInterlock)).toContain("No lifecycle- or review-authored commit or push");
    expect(workflow).toContain("PR open, not merged");
    expect(workflow).toContain("`post-pr-open` → review iteration");
  });

  it("fails closed across every Errand PR lookup state", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    for (const state of [
      "No match", "One open match", "One merged match at the current head", "Closed-unmerged",
      "multiple/conflicting matches", "lookup error", "incomplete enumeration",
    ]) expect(workflow).toContain(state);
    expect(workflow).toContain("--paginate --slurp");
    expect(workflow).toContain("state=all&head={owner}:{branch}");
  });

  it("keeps WU and Errand hook ordering symmetric", async () => {
    const workflows = await Promise.all([
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      "system/workflows/arc/supplemental/run-errand.md",
    ].map((path) => readFile(resolve(packageArc, path), "utf8")));
    for (const workflow of workflows) {
      expect(workflow.indexOf("proposedChangeRequest")).toBeLessThan(workflow.indexOf("gh pr create"));
      expect(workflow.indexOf("openedChangeRequest")).toBeGreaterThan(workflow.indexOf("gh pr create"));
      expect(workflow.indexOf("pre-merge-review", workflow.indexOf("openedChangeRequest")))
        .toBeLessThan(workflow.indexOf("`integration-interlock`", workflow.indexOf("openedChangeRequest")));
      expect(workflow.toLowerCase()).toContain("halt before later actions");
    }
  });

  it("keeps diff review author-side and provider-neutral", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/diff-review.md"), "utf8");
      expect(method).toContain("author-side");
      expect(method).toContain("not peer/independent review evidence");
      expect(method).toContain("**Correctness**");
      expect(method).toContain("**Error paths**");
      expect(method.replace(/\s+/gu, " ")).toContain("invokes no external review provider by default");
      expect(method).not.toMatch(/coderabbit|copilot|claude/iu);
    }
  });
});
