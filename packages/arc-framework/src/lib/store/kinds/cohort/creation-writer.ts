/** Creation of cohort identity and optional member coordination from the canonical template. */
import { SlugSchema, type Slug } from "../../../kernel/index.js";

/** One authored member section, preserved in its supplied order. */
export interface CohortMemberSection { readonly slug: Slug; readonly body: string }

/** Create a cohort document from the template's identity floor.
 * @param template - Canonical cohort template text.
 * @param cohort - Canonical one- or two-segment cohort path.
 * @param purpose - Authored Purpose, or undefined for the incomplete sentinel.
 * @param members - Optional member headings and their authored bodies.
 * @returns Created content, or null for an invalid path or a drifted template.
 */
export function writeCohortDocument(template: string, cohort: string, purpose?: string, members: readonly CohortMemberSection[] = []): string | null {
  const source = template.replaceAll("\r\n", "\n");
  const heading = "# Cohort: `{cohort-name}`\n";
  const parentStart = source.indexOf("**Parent:**");
  const purposeStart = source.indexOf("**Purpose:** {");
  if (!source.startsWith(heading) || parentStart < heading.length || purposeStart <= parentStart) return null;
  const segments = cohort.split("/");
  if (segments.length > 2 || !segments.every((segment) => SlugSchema.safeParse(segment).success)) return null;
  const leaf = segments.at(-1);
  if (leaf === undefined) return null;
  const identity = source.slice(heading.length, parentStart);
  const parent = segments.length === 2 ? `**Parent:** \`${segments[0]}\`\n\n` : "";
  const floor = `# Cohort: \`${leaf}\`\n${identity}${parent}**Purpose:** ${purpose ?? "—"}\n\n---\n`;
  if (members.length === 0) return floor;
  const sections = members.map(({ slug, body }) => `### \`${slug}\`\n\n${body}`).join("\n\n");
  return `${floor}\n## Members\n\n${sections}\n\n---\n`;
}
