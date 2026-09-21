/** Durable TypeScript acceptance runner for the shared commit-message corpus. */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { COMMIT_MESSAGE_FIXTURES } from "../fixtures/commit-msg/cases.js";
import { runTypeScriptFixture } from "../helpers/commit-message-fixture.js";

const root = resolve(import.meta.dirname, "../../../..");
const workflowRoot = resolve(root, "packages/arc-framework/arc/system/workflows/arc");
const commitFormatPaths = [
  resolve(root, "packages/arc-framework/arc/system/methods/commit-format.md"),
  resolve(root, ".arc/system/methods/commit-format.md"),
];
const longWorkUnitName = "delivery-post-landing-conflict-recovery";
const wholeSubjectFallback = "fix(w): wu";
const subjectTemplatePattern =
  /^[ \t]*(?:feat|fix|chore|docs|refactor|test|perf|revert)\([a-z0-9-]+\): .*\{(?:name|work-name|origin|slug)\}.*$/gmu;

async function markdownFiles(directory: string): Promise<string[]> {
  return (await readdir(directory, { recursive: true }))
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => resolve(directory, entry));
}

function renderSubjectIdentity(template: string, identity: string): string {
  return template.replace(/\{(?:name|work-name|origin|slug)\}/gu, identity);
}

describe("canonical commit-message corpus", () => {
  for (const fixture of COMMIT_MESSAGE_FIXTURES) {
    it(fixture.name, async () => {
      const outcome = await runTypeScriptFixture(fixture);
      expect(outcome).toMatchObject({ kind: "validated", verdict: fixture.expected.verdict });
      if (outcome.kind !== "validated") throw new Error("expected validated outcome");
      const codes = outcome.findings.map(({ code }) => code);
      expect(codes).toEqual(fixture.expected.findingCodes);
    });
  }

  it.each(commitFormatPaths)("publishes one deterministic long-identity fallback in %s", async (path) => {
    const method = await readFile(path, "utf8");

    expect(method).toContain("final hyphen-delimited segment");
    expect(method).toContain("substitute every identity with");
    expect(method).toContain("`{slug}`");
    expect(method).toContain("`fix(w): wu`");
    expect(method).toMatch(/subject-only[\s\S]*body[\s\S]*`Context:` footer/iu);
  });

  it("keeps every identity-bearing literal workflow subject viable under the 72-character cap", async () => {
    const abbreviated = longWorkUnitName.split("-").at(-1) ?? "wu";
    let templateCount = 0;
    const templates: string[] = [];

    for (const path of await markdownFiles(workflowRoot)) {
      const workflow = await readFile(path, "utf8");
      for (const match of workflow.matchAll(subjectTemplatePattern)) {
        const template = match[0].trimStart();
        templateCount += 1;
        templates.push(template);
        expect(renderSubjectIdentity(template, abbreviated).length, `${path}: ${template}`).toBeLessThanOrEqual(72);
        expect(renderSubjectIdentity(template, "wu").length, `${path}: ${template}`).toBeLessThanOrEqual(72);
      }
    }

    expect(templateCount).toBeGreaterThanOrEqual(20);
    expect(templates).toContain("chore(arc): promote {slug} errand to {name} work unit");
  });

  it("provides a valid whole-subject fallback at the minimum supported cap", async () => {
    const outcome = await runTypeScriptFixture({
      name: "minimum-cap workflow fallback",
      messageBytes: new TextEncoder().encode(`${wholeSubjectFallback}\n`),
      config: "hooks.subject_max_length: 10\ncommit.context_footer: disabled\n",
      repository: {},
      expected: { verdict: "pass", findingCodes: [] },
    });

    expect(wholeSubjectFallback).toHaveLength(10);
    expect(outcome).toMatchObject({ kind: "validated", verdict: "pass", findings: [] });
  });
});
