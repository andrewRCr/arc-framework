/** Extract project-authored legacy commands into inactive check proposals. */
import { parseFrontmatter } from "../frontmatter/generic.js";
import type { CheckGate } from "./request.js";

export interface CheckProposalSources {
  quickReference?: string;
  method?: string;
  postTask?: string;
  postUnit?: string;
}
export interface ProposedCommand { command: string; mappedGate: CheckGate; sources: string[] }
export interface UnextractableSource { source: string; text: string }
export interface CheckProposal { commands: ProposedCommand[]; unextractable: UnextractableSource[]; proposal: string }

const gateOrder: readonly CheckGate[] = ["commit", "push", "merge"];
export const checkProposalSourceFiles = {
  quickReference: "reference/QUICK-REFERENCE.md",
  method: "system/methods/quality-gate-commands.md",
  postTask: "system/extensions/post-task-quality.md",
  postUnit: "system/extensions/post-unit-quality.md",
};
interface Fence { marker: string; length: number; shell: boolean }
function openingFence(line: string): Fence | undefined {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/u.exec(line);
  return match?.[1] === undefined ? undefined : {
    marker: match[1].charAt(0), length: match[1].length, shell: match[2] === "bash" || match[2] === "sh",
  };
}
function closingFence(line: string, fence: Fence): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === fence.marker.repeat(trimmed.length);
}
function heading(line: string): { depth: number; title: string } | undefined {
  const match = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u.exec(line);
  return match?.[1] === undefined || match[2] === undefined ? undefined : { depth: match[1].length, title: match[2] };
}
function section(content: string, title: string): string {
  const lines: string[] = [];
  let depth: number | undefined;
  let fence: Fence | undefined;
  for (const line of content.split(/\r?\n/u)) {
    if (fence !== undefined) {
      if (depth !== undefined) lines.push(line);
      if (closingFence(line, fence)) fence = undefined;
      continue;
    }
    const nextHeading = heading(line);
    if (nextHeading !== undefined) {
      if (depth !== undefined && nextHeading.depth <= depth) break;
      if (depth === undefined && nextHeading.title === title) { depth = nextHeading.depth; continue; }
    }
    fence = openingFence(line);
    if (depth !== undefined) lines.push(line);
  }
  return lines.join("\n");
}
function placeholder(line: string): boolean {
  return /^\[[^\]]+\]$/u.test(line) && !line.startsWith("[ ");
}
interface ExtractedLine { command: string; mappedGate: CheckGate }
interface ExtractionState {
  gate: CheckGate | undefined;
  tierDepth: number | undefined;
  fence: Fence | undefined;
  block: string[];
  commands: ExtractedLine[];
  prose: string[];
}
function updateTier(state: ExtractionState, next: { depth: number; title: string }, defaultGate?: CheckGate): void {
  const tier = /\bTier\s+([123])\b/iu.exec(next.title)?.[1];
  if (tier !== undefined) { state.gate = gateOrder[Number(tier) - 1]; state.tierDepth = next.depth; }
  else if (state.tierDepth !== undefined && next.depth <= state.tierDepth) {
    state.gate = defaultGate; state.tierDepth = undefined;
  }
}
function meaningful(line: string): boolean {
  return line.length > 0 && line !== "---" && !placeholder(line) && !line.startsWith("#")
    && !/^\[[^\]]+\]:/u.test(line);
}
function consumeFencedLine(state: ExtractionState, line: string, fence: Fence): void {
  if (!closingFence(line, fence)) { state.block.push(line); return; }
  finishBlock(state, fence);
  state.fence = undefined;
}
function finishBlock(state: ExtractionState, fence: Fence, complete = true): void {
  const lines = state.block;
  state.block = [];
  if (!lines.some(line => meaningful(line.trim()))) return;
  const command = lines.join("\n") + (complete ? "\n" : "");
  if (complete && fence.shell && state.gate !== undefined && !lines.some(line => placeholder(line.trim()))) {
    state.commands.push({ command, mappedGate: state.gate });
  } else state.prose.push(command);
}
function extractLines(content: string, defaultGate?: CheckGate): { commands: ExtractedLine[]; prose: string[] } {
  const state: ExtractionState = { gate: defaultGate, tierDepth: undefined, fence: undefined, block: [], commands: [], prose: [] };
  for (const line of content.split(/\r?\n/u)) {
    if (state.fence !== undefined) { consumeFencedLine(state, line, state.fence); continue; }
    state.fence = openingFence(line);
    if (state.fence !== undefined) continue;
    const nextHeading = heading(line);
    if (nextHeading !== undefined) { updateTier(state, nextHeading, defaultGate); continue; }
    const trimmed = line.trim();
    if (meaningful(trimmed)) state.prose.push(trimmed);
  }
  if (state.fence !== undefined) finishBlock(state, state.fence, false);
  return { commands: state.commands, prose: state.prose };
}
function activeOverride(content: string): boolean {
  const data = parseFrontmatter(content).data;
  return typeof data === "object" && data !== null && "override-active" in data && data["override-active"] === true;
}
function renderProposal(commands: readonly ProposedCommand[]): string {
  if (commands.length === 0) return "checks: {}\n";
  return `checks:\n${commands.map((entry, index) => [
    `  imported-${index + 1}:`, `    # Mapped gate: ${entry.mappedGate}`,
    ...entry.sources.map(source => `    # Source: ${source}`),
    `    command: ${JSON.stringify(entry.command)}`, "    shell: true",
  ].join("\n")).join("\n")}\n`;
}
/**
 * Extract commands while retaining their suggested deadlines and source locations.
 * @param sources - Source snapshots taken before installation changes
 * @returns A gate-unset proposal and source material requiring manual authoring
 */
export function extractCheckProposal(sources: CheckProposalSources): CheckProposal {
  const regions = [
    { source: `.arc/${checkProposalSourceFiles.quickReference}`, body: section(sources.quickReference ?? "", "Quality Gate Commands"), gate: undefined },
    { source: `.arc/${checkProposalSourceFiles.method}`, body: sources.method !== undefined && activeOverride(sources.method)
      ? section(sources.method, "quality-gate-commands.override") : "", gate: undefined },
    { source: `.arc/${checkProposalSourceFiles.postTask}`, body: section(sources.postTask ?? "", "post-task-quality.actions"), gate: "commit" as const },
    { source: `.arc/${checkProposalSourceFiles.postUnit}`, body: section(sources.postUnit ?? "", "post-unit-quality.actions"), gate: "push" as const },
  ];
  const commands = new Map<string, ProposedCommand>();
  const unextractable: UnextractableSource[] = [];
  for (const region of regions) {
    const extracted = extractLines(region.body, region.gate);
    for (const entry of extracted.commands) {
      const previous = commands.get(entry.command);
      if (previous === undefined) commands.set(entry.command, { ...entry, sources: [region.source] });
      else {
        if (gateOrder.indexOf(entry.mappedGate) < gateOrder.indexOf(previous.mappedGate)) previous.mappedGate = entry.mappedGate;
        if (!previous.sources.includes(region.source)) previous.sources.push(region.source);
      }
    }
    unextractable.push(...extracted.prose.map(text => ({ source: region.source, text })));
  }
  const entries = [...commands.values()];
  return { commands: entries, unextractable, proposal: renderProposal(entries) };
}
