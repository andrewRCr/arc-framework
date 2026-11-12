/** Cohort identity creation, template drift, and ordered authored member sections. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../../../src/lib/kernel/index.js";
import { writeCohortDocument, parseCohortDocument } from "../../../../../../src/lib/store/kinds/cohort/index.js";

const identity = "\n> _Identity and coordination record for this cohort._\n\n";
const template = `# Cohort: \`{cohort-name}\`\n${identity}**Parent:** {Parent guidance}\n\n**Purpose:** {Required Purpose}\n\n---\n\nOptional scaffold\n`;
const newTemplate = template.replace("**Parent:** {Parent guidance}", "**Parent:** `{parent-cohort-name}`\n\n{Parent guidance}");

describe("cohort creation writer", () => {
  it.each([
    ["top-level", "group", null],
    ["subcohort", "outer-group/inner-group", "outer-group"],
  ] as const)("creates a %s document that parses with its Purpose and Parent", (_name, cohort, parent) => {
    const content = writeCohortDocument(template, cohort, "A shared thesis.");
    expect(content).not.toBeNull();
    if (content === null) throw new Error("Expected canonical cohort content");
    expect(content.startsWith(`# Cohort: \`${cohort.split("/").at(-1)}\`\n${identity}`)).toBe(true);
    expect(parseCohortDocument(content)).toEqual({ success: true, data: { purpose: "A shared thesis.", parent } });
    expect(content.endsWith("\n\n---\n")).toBe(true);
    if (parent === null) expect(content).not.toContain("**Parent:**");
    else expect(content).toContain(`**Parent:** \`${parent}\`\n`);
  });

  it("writes the incomplete sentinel when Purpose is absent", () => {
    const content = writeCohortDocument(template, "group");
    expect(content === null ? null : parseCohortDocument(content)).toEqual({ success: true, data: { purpose: "—", parent: null } });
  });

  it("renders member bodies unchanged under Members in supplied order", () => {
    const members = [
      { slug: SlugSchema.parse("zeta"), body: "  Indented authored text\n\nMore prose" },
      { slug: SlugSchema.parse("alpha"), body: "Another member's prose" },
    ];
    const content = writeCohortDocument(template, "group", "Shared thesis", members);
    expect(content).toContain(`\n\n---\n\n## Members\n\n### \`zeta\`\n\n${members[0]?.body}\n\n### \`alpha\`\n\n${members[1]?.body}\n\n---\n`);
  });

  it("takes the same identity from both template Parent forms, normalizing template CRLF", () => {
    expect(writeCohortDocument(newTemplate.replaceAll("\n", "\r\n"), "outer/inner", "Shared thesis"))
      .toBe(writeCohortDocument(template, "outer/inner", "Shared thesis"));
  });

  it.each([
    ["heading", template.replace("# Cohort: `{cohort-name}`", "# Incorrect")],
    ["Parent label", template.replace("**Parent:**", "Parent:")],
    ["Purpose placeholder", template.replace("**Purpose:** {Required Purpose}", "**Purpose:** Authored")],
  ])("refuses a template lacking its %s", (_name, content) => {
    expect(writeCohortDocument(content, "group", "Shared thesis")).toBeNull();
  });

  it.each(["", "Bad_Name", "outer/inner/deeper"])("refuses the noncanonical path %s", (cohort) => {
    expect(writeCohortDocument(template, cohort, "Shared thesis")).toBeNull();
  });
});
