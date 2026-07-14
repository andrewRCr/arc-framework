/** Exact-head resolution for hosted Codex review guidance. */

import { hashContent } from "../../../../lib/manifest/hash.js";
import type { HostChangedPath } from "../../core/ports.js";

export const CODEX_RUBRIC_VERSION = "independent-analysis/v1";

const REQUIRED_DIMENSIONS = [
  "intent and scope",
  "correctness and failure behavior",
  "trust",
  "compatibility",
  "verification",
  "coherence and maintainability",
] as const;

export interface CodexGuidanceObjectReader {
  readText(headSha: string, path: string): Promise<
    | { kind: "ok"; observedHeadSha: string; content: string }
    | { kind: "missing" }
    | { kind: "unreadable" }
  >;
}

export type CodexGuidanceResolution =
  | {
    qualified: true;
    headSha: string;
    rubricVersion: typeof CODEX_RUBRIC_VERSION;
    targets: string[];
    guidancePaths: string[];
    digest: string;
  }
  | { qualified: false; reasons: string[] };

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function guidanceCandidates(target: string): string[] {
  const candidates = ["AGENTS.md"];
  const directory = dirname(target);
  if (directory.length === 0) return candidates;
  const segments = directory.split("/").filter((segment) => segment.length > 0);
  let current = "";
  for (const segment of segments) {
    current = current.length === 0 ? segment : `${current}/${segment}`;
    candidates.push(`${current}/AGENTS.md`);
  }
  return candidates;
}

function changedTargets(changes: readonly HostChangedPath[]): string[] {
  const targets: string[] = [];
  for (const change of changes) {
    if (change.status === "renamed") targets.push(change.previousPath, change.path);
    else targets.push(change.path);
  }
  return [...new Set(targets)];
}

function reviewGuidelines(content: string): string | null {
  const match = /^## Review guidelines\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/imu.exec(content);
  if (match?.[1] === undefined) return null;
  const section = match[1].trim().toLowerCase();
  if (!section.includes(CODEX_RUBRIC_VERSION)) return null;
  if (REQUIRED_DIMENSIONS.some((dimension) => !section.includes(dimension))) return null;
  return section;
}

/** Resolve one unambiguous effective guidance set from exact-head git objects. */
export async function resolveCodexGuidance(input: {
  headSha: string;
  changes: readonly HostChangedPath[];
  reader: CodexGuidanceObjectReader;
}): Promise<CodexGuidanceResolution> {
  const targets = changedTargets(input.changes);
  const cache = new Map<string, Awaited<ReturnType<CodexGuidanceObjectReader["readText"]>>>();
  const effectiveSets: Array<Array<{ path: string; content: string }>> = [];

  for (const target of targets) {
    const effective: Array<{ path: string; content: string }> = [];
    for (const path of guidanceCandidates(target)) {
      let resolved = cache.get(path);
      if (resolved === undefined) {
        resolved = await input.reader.readText(input.headSha, path);
        cache.set(path, resolved);
      }
      if (resolved.kind === "unreadable") return { qualified: false, reasons: [`guidance-unreadable:${path}`] };
      if (resolved.kind === "missing") {
        if (path === "AGENTS.md") return { qualified: false, reasons: ["missing-guidance:AGENTS.md"] };
        continue;
      }
      if (resolved.observedHeadSha !== input.headSha) {
        return { qualified: false, reasons: [`guidance-head-mismatch:${path}`] };
      }
      effective.push({ path, content: resolved.content });
    }
    effectiveSets.push(effective);
  }

  const root = cache.get("AGENTS.md");
  if (root?.kind !== "ok") return { qualified: false, reasons: ["missing-guidance:AGENTS.md"] };
  if (reviewGuidelines(root.content) === null) {
    return { qualified: false, reasons: ["review-guidelines-missing:AGENTS.md"] };
  }
  const signatures = effectiveSets.map((items) => JSON.stringify(items));
  if (signatures.some((signature) => signature !== signatures[0])) {
    return { qualified: false, reasons: ["conflicting-effective-guidance"] };
  }
  const effective = effectiveSets[0] ?? [{ path: "AGENTS.md", content: root.content }];
  return {
    qualified: true,
    headSha: input.headSha,
    rubricVersion: CODEX_RUBRIC_VERSION,
    targets,
    guidancePaths: effective.map((item) => item.path),
    digest: hashContent(JSON.stringify(effective)),
  };
}
