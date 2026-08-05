/** Write-only delivery-plan projection for the task list. */

import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWriteFile } from "../fs.js";
import { scanTaskListStructure } from "../task-list/scanner.js";
import { DeliveryPlanV1Schema, type DeliveryPlanV1 } from "./schema.js";

/** Exact replacement sentinels owned by the delivery renderer. */
export const DELIVERY_PLAN_START_SENTINEL = "<!-- arc:delivery-plan:start -->";
export const DELIVERY_PLAN_END_SENTINEL = "<!-- arc:delivery-plan:end -->";

/** Pure task-list replacement outcome. */
export type ReplaceDeliveryPlanSectionResult =
  | { readonly status: "rendered"; readonly content: string }
  | {
    readonly status: "refused";
    readonly reason:
      | "record-malformed"
      | "replacement-locus-missing"
      | "replacement-locus-duplicate"
      | "replacement-locus-malformed";
  };

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

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s*\r?\n\s*/gu, " ");
}

function displayList(values: readonly string[], code = false): string {
  if (values.length === 0) return "—";
  return values.map((value) => code ? `\`${tableCell(value)}\`` : tableCell(value)).join("<br>");
}

/** Render the informative section directly from one validated plan record. */
export function renderDeliveryPlanSection(input: DeliveryPlanV1): string {
  const plan = DeliveryPlanV1Schema.parse(input);
  const stack = plan.projection.kind === "stack-to-main";
  const taskCounts = new Map<string, number>();
  for (const member of plan.members) {
    for (const taskId of member.taskIds) taskCounts.set(taskId, (taskCounts.get(taskId) ?? 0) + 1);
  }
  const memberNumber = new Map(plan.members.map((member, index) => (
    [member.deliverableId, index + 1] as const
  )));
  const headings = stack
    ? ["#", "Member", "Chunk key", "Tasks", "Design elements", "Status", "Landability"]
    : ["#", "Member", "Chunk key", "Tasks", "Design elements", "Status"];
  const divider = headings.map(() => "---");
  const memberRows = plan.members.map((member, index) => {
    const tasks = member.taskIds.length === 0
      ? "—"
      : member.taskIds.map((taskId) => (
        `\`${taskId}\`${(taskCounts.get(taskId) ?? 0) > 1 ? " (shared)" : ""}`
      )).join("<br>");
    const cells = [
      String(index + 1),
      tableCell(member.title),
      `\`${member.chunkKey}\``,
      tasks,
      displayList(member.designElementIds, true),
      member.status === "landed" ? "landed (as of landing)" : "live",
    ];
    if (stack) cells.push(`\`${member.mainlineLandability}\``);
    return `| ${cells.join(" | ")} |`;
  });
  const seamLines = plan.seams.length === 0
    ? ["_None._"]
    : [
      "| Seam | Incident members | Owner | Acceptance | Design elements |",
      "|---|---|---|---|---|",
      ...plan.seams.map((seam) => {
        const incident = seam.incidentDeliverableIds.map((id) => memberNumber.get(id) ?? "?").join(", ");
        const owner = memberNumber.get(seam.ownerDeliverableId) ?? "?";
        return `| ${tableCell(seam.title)} | ${incident} | ${owner} | ${tableCell(seam.acceptance)} | ${
          displayList(seam.designElementIds, true)
        } |`;
      }),
    ];

  return [
    DELIVERY_PLAN_START_SENTINEL,
    "## Delivery Plan",
    "",
    `- **Plan Revision:** \`${plan.planRevision}\``,
    `- **Plan Digest:** \`${plan.planDigest}\``,
    `- **Projection:** \`${plan.projection.kind}\``,
    "",
    `| ${headings.join(" | ")} |`,
    `|${divider.join("|")}|`,
    ...memberRows,
    "",
    "### Named seams",
    "",
    ...seamLines,
    DELIVERY_PLAN_END_SENTINEL,
    "",
    "",
  ].join("\n");
}

interface TextLines {
  readonly values: readonly string[];
  readonly starts: readonly number[];
}

function textLines(content: string): TextLines {
  const values = content.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
  const starts: number[] = [];
  let offset = 0;
  for (const line of content.split("\n")) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return { values, starts };
}

function replaceMarkedRange(content: string, plan: DeliveryPlanV1, lines: TextLines) {
  const starts = lines.values.flatMap((line, index) => (
    line === DELIVERY_PLAN_START_SENTINEL ? [index] : []
  ));
  const ends = lines.values.flatMap((line, index) => (
    line === DELIVERY_PLAN_END_SENTINEL ? [index] : []
  ));
  if (starts.length !== 1 || ends.length !== 1) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  const startLine = starts[0];
  const endLine = ends[0];
  if (startLine === undefined || endLine === undefined || startLine >= endLine
    || lines.values[startLine + 1] !== "## Delivery Plan"
    || lines.values.slice(startLine + 1, endLine).filter((line) => line === "## Delivery Plan").length !== 1) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  const startOffset = lines.starts[startLine];
  const endOffset = lines.starts[endLine + 1] ?? content.length;
  if (startOffset === undefined) {
    return { status: "refused", reason: "replacement-locus-malformed" } as const;
  }
  return {
    status: "rendered",
    content: `${content.slice(0, startOffset)}${renderDeliveryPlanSection(plan)}${content.slice(endOffset)}`,
  } as const;
}

/** Replace the exact sentinel range, or bootstrap it from one unmarked top-level section. */
export function replaceDeliveryPlanSection(
  content: string,
  input: DeliveryPlanV1,
): ReplaceDeliveryPlanSectionResult {
  const parsedPlan = DeliveryPlanV1Schema.safeParse(input);
  if (!parsedPlan.success) return { status: "refused", reason: "record-malformed" };
  const lines = textLines(content);
  const markerCount = lines.values.filter((line) => (
    line === DELIVERY_PLAN_START_SENTINEL || line === DELIVERY_PLAN_END_SENTINEL
  )).length;
  if (markerCount > 0) return replaceMarkedRange(content, parsedPlan.data, lines);

  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") {
    return { status: "refused", reason: "replacement-locus-malformed" };
  }
  const deliveryLines = scan.events.flatMap((event) => (
    event.type === "section" && lines.values[event.line - 1] === "## Delivery Plan"
      ? [event.line]
      : []
  ));
  if (deliveryLines.length === 0) return { status: "refused", reason: "replacement-locus-missing" };
  if (deliveryLines.length > 1) return { status: "refused", reason: "replacement-locus-duplicate" };
  const targetLine = deliveryLines[0];
  if (targetLine === undefined) return { status: "refused", reason: "replacement-locus-missing" };
  const nextSection = scan.events.find((event) => (
    (event.type === "section" || event.type === "phase") && event.line > targetLine
  ));
  const startOffset = lines.starts[targetLine - 1];
  const endOffset = nextSection === undefined ? content.length : lines.starts[nextSection.line - 1];
  if (startOffset === undefined || endOffset === undefined) {
    return { status: "refused", reason: "replacement-locus-malformed" };
  }
  return {
    status: "rendered",
    content: `${content.slice(0, startOffset)}${renderDeliveryPlanSection(parsedPlan.data)}${content.slice(endOffset)}`,
  };
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
