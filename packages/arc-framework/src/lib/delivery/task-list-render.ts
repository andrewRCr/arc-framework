/** Write-only delivery-plan projection for the task list. */

import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWriteFile } from "../fs.js";
import { displayWidth, padToDisplayWidth } from "../markdown/display-width.js";
import { spliceDeliveryPlanSection, DELIVERY_PLAN_START_SENTINEL, DELIVERY_PLAN_END_SENTINEL,
  type SpliceDeliveryPlanSectionResult } from "../store/kinds/task-list/index.js";
import { DeliveryPlanV1Schema, type DeliveryPlanV1 } from "./schema.js";

/** Pure task-list replacement outcome, including plan-record validation. */
export type ReplaceDeliveryPlanSectionResult = SpliceDeliveryPlanSectionResult
  | { readonly status: "refused"; readonly reason: "record-malformed" };

/** Repository adapter outcome, including path and I/O boundary refusals. */
export type DeliveryTaskListRenderResult = ReplaceDeliveryPlanSectionResult
  | { readonly status: "refused"; readonly reason: "task-list-path-invalid" | "task-list-unreadable" };

/** Injectable filesystem boundary for deterministic renderer tests. */
export interface DeliveryTaskListRendererIO {
  readonly readFile: (path: string) => Promise<string>;
  readonly realpath: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
}

/** Write-only port consumed by composition after plan publication succeeds. */
export interface DeliveryTaskListRenderer {
  render(plan: DeliveryPlanV1): Promise<DeliveryTaskListRenderResult>;
}

const DELIVERY_PLAN_WRAP_COLUMN = 120;

function inlineText(value: string): string {
  return value.replace(/\s*\r?\n\s*/gu, " ");
}

function tableCell(value: string): string {
  return inlineText(value).replaceAll("|", "\\|");
}

function displayList(values: readonly string[], code = false): string {
  if (values.length === 0) return "—";
  return values.map((value) => code ? `\`${tableCell(value)}\`` : tableCell(value)).join(", ");
}

function renderAlignedTable(headings: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const widths = headings.map((heading, index) => Math.max(
    3,
    displayWidth(heading),
    ...rows.map((row) => displayWidth(row[index] ?? "")),
  ));
  const renderRow = (cells: readonly string[]) => (
    `| ${headings.map((_, index) => (
      padToDisplayWidth(cells[index] ?? "", widths[index] ?? 3)
    )).join(" | ")} |`
  );
  return [
    renderRow(headings),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map(renderRow),
  ];
}

function wrapLabeledBullet(label: string, value: string): string[] {
  const words = inlineText(`**${label}:** ${value}`).split(/\s+/u);
  const lines: string[] = [];
  let current = "-";
  for (const word of words) {
    const candidate = `${current} ${word}`;
    if (current !== "-" && displayWidth(candidate) > DELIVERY_PLAN_WRAP_COLUMN) {
      lines.push(current);
      current = `  ${word}`;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

function landabilitySummary(plan: DeliveryPlanV1): string {
  const values = new Set(plan.members.map((member) => member.mainlineLandability));
  if (values.size === 1) {
    const value = values.values().next().value;
    return `- **Landability:** All members are \`${value}\`.`;
  }
  if (plan.members.length === 0) return "- **Landability:** —";
  return `- **Landability:** ${plan.members.map((member, index) => (
    `${index + 1} \`${member.mainlineLandability}\``
  )).join(", ")}.`;
}

/** Render the informative section directly from one validated plan record. */
export function renderDeliveryPlanSection(input: DeliveryPlanV1): string {
  const plan = DeliveryPlanV1Schema.parse(input);
  const taskCounts = new Map<string, number>();
  for (const member of plan.members) {
    for (const taskId of member.taskIds) taskCounts.set(taskId, (taskCounts.get(taskId) ?? 0) + 1);
  }
  const memberNumber = new Map(plan.members.map((member, index) => (
    [member.deliverableId, index + 1] as const
  )));
  const memberIdentityRows = plan.members.map((member, index) => [
    String(index + 1),
    tableCell(member.title),
    `\`${member.chunkKey}\``,
  ]);
  const memberCoverageRows = plan.members.map((member, index) => {
    const tasks = member.taskIds.length === 0
      ? "—"
      : member.taskIds.map((taskId) => (
        `\`${taskId}\`${(taskCounts.get(taskId) ?? 0) > 1 ? " (shared)" : ""}`
      )).join(", ");
    return [
      String(index + 1),
      tasks,
      displayList(member.designElementIds, true),
    ];
  });
  const memberIdentityTable = renderAlignedTable(["#", "Member", "Chunk key"], memberIdentityRows);
  const memberCoverageTable = renderAlignedTable(["#", "Tasks", "Design elements"], memberCoverageRows);
  const seamLines = plan.seams.length === 0
    ? ["_None._"]
    : [
      ...renderAlignedTable(
        ["#", "Seam", "Members", "Owner", "Design elements"],
        plan.seams.map((seam, index) => {
          const incident = seam.incidentDeliverableIds.map((id) => memberNumber.get(id) ?? "?").join(", ");
          const owner = memberNumber.get(seam.ownerDeliverableId) ?? "?";
          return [
            String(index + 1),
            tableCell(seam.title),
            incident,
            String(owner),
            displayList(seam.designElementIds, true),
          ];
        }),
      ),
      "",
      "#### Acceptance",
      "",
      ...plan.seams.flatMap((seam, index) => [
        ...wrapLabeledBullet(`${index + 1}. ${inlineText(seam.title)}`, seam.acceptance),
        ...index < plan.seams.length - 1 ? [""] : [],
      ]),
    ];

  return [
    DELIVERY_PLAN_START_SENTINEL,
    "## Delivery Plan",
    "",
    `- **Plan Revision:** \`${plan.planRevision}\``,
    `- **Plan Digest:** \`${plan.planDigest}\``,
    `- **Projection:** \`${plan.projection.kind}\``,
    landabilitySummary(plan),
    "",
    "### Members",
    "",
    ...memberIdentityTable,
    "",
    "#### Member coverage",
    "",
    ...memberCoverageTable,
    "",
    "### Named seams",
    "",
    ...seamLines,
    DELIVERY_PLAN_END_SENTINEL,
    "",
    "",
  ].join("\n");
}

/** Validate and render the plan before replacing its task-list region.
 * @param content - Whole task-list Markdown.
 * @param input - Plan to validate and render.
 * @returns The replacement content or the validation or region refusal.
 */
export function replaceDeliveryPlanSection(content: string, input: DeliveryPlanV1): ReplaceDeliveryPlanSectionResult {
  const parsedPlan = DeliveryPlanV1Schema.safeParse(input);
  if (!parsedPlan.success) return { status: "refused", reason: "record-malformed" };
  return spliceDeliveryPlanSection(content, renderDeliveryPlanSection(parsedPlan.data));
}

/** Filesystem adapter that confines the target to the repository and atomically replaces it. */
export class RepositoryDeliveryTaskListRenderer implements DeliveryTaskListRenderer {
  private readonly io: DeliveryTaskListRendererIO;

  constructor(
    private readonly cwd: string,
    private readonly taskListPath: string,
    io: Partial<DeliveryTaskListRendererIO> = {},
  ) {
    this.io = {
      readFile: io.readFile ?? ((path) => readFile(path, "utf8")),
      realpath: io.realpath ?? realpath,
      writeFile: io.writeFile ?? atomicWriteFile,
    };
  }

  async render(plan: DeliveryPlanV1): Promise<DeliveryTaskListRenderResult> {
    const target = await this.resolveTarget();
    if (target === null) return { status: "refused", reason: "task-list-path-invalid" };
    let current: string;
    try {
      current = await this.io.readFile(target);
    } catch {
      return { status: "refused", reason: "task-list-unreadable" };
    }
    const replacement = replaceDeliveryPlanSection(current, plan);
    if (replacement.status === "refused") return replacement;
    try {
      await this.io.writeFile(target, replacement.content);
    } catch {
      return { status: "refused", reason: "task-list-unreadable" };
    }
    return replacement;
  }

  private async resolveTarget(): Promise<string | null> {
    const normalized = this.taskListPath.replaceAll("\\", "/");
    if (normalized.length === 0 || isAbsolute(this.taskListPath)
      || normalized.split("/").some((part) => part === ".." || part === "")) return null;
    try {
      const repository = await this.io.realpath(this.cwd);
      const target = await this.io.realpath(resolve(repository, ...normalized.split("/")));
      const relation = relative(repository, target).replaceAll("\\", "/");
      return relation === "" || relation === ".." || relation.startsWith("../") || isAbsolute(relation)
        ? null
        : target;
    } catch {
      return null;
    }
  }
}
