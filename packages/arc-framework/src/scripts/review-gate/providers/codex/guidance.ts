/** Exact-head resolution for hosted Codex review guidance. */

import { canonicalDigest, sortByCanonicalBytes } from "../../../../lib/kernel/index.js";
import { hashContent } from "../../../../lib/manifest/hash.js";
import type { HostChangedPath } from "../../core/ports.js";
import { ReviewGuidanceDigestPreimageSchema } from "../../policy/standard-review-schema.js";
import {
  STANDARD_REVIEW_BASELINE_CONTRACT,
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "../../policy/standard-review.js";
import {
  admitSelfHostingGuidanceCarrier,
  SELF_HOSTING_REVIEW_GUIDANCE_END,
  SELF_HOSTING_REVIEW_GUIDANCE_START,
} from "../../policy/self-hosting/guidance.js";

export const CODEX_RUBRIC_VERSION = STANDARD_REVIEW_RUBRIC_IDENTITY.version;

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
    rubricDigest: string;
    targets: string[];
    guidancePaths: string[];
    baseline: typeof STANDARD_REVIEW_BASELINE_CONTRACT;
    projectAugmentation: Array<{ path: string; content: string }>;
    guidanceDigest: string;
    /** Schema-v1 command digest retained until explicit contract dispatch migrates the carrier. */
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
    if (change.previousPath !== undefined) targets.push(change.previousPath, change.path);
    else targets.push(change.path);
  }
  return [...new Set(targets)];
}

function reviewGuidelines(content: string): "current" | "missing" | "stale" {
  const match = /^## Review guidelines\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/imu.exec(content);
  if (match?.[1] === undefined) {
    return content.includes(SELF_HOSTING_REVIEW_GUIDANCE_START)
      || content.includes(SELF_HOSTING_REVIEW_GUIDANCE_END)
      ? "stale"
      : "missing";
  }
  const section = match[1].trim();
  const admission = admitSelfHostingGuidanceCarrier("hosted-codex", section);
  if (!admission.admitted) return admission.reason === "managed-guidance-missing" ? "missing" : "stale";
  const normalized = section.toLowerCase();
  if (!normalized.includes(CODEX_RUBRIC_VERSION)) return "stale";
  if (REQUIRED_DIMENSIONS.some((dimension) => !normalized.includes(dimension))) return "stale";
  return "current";
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
      if (path !== "AGENTS.md" && reviewGuidelines(resolved.content) === "stale") {
        return { qualified: false, reasons: [`review-guidelines-stale:${path}`] };
      }
      effective.push({ path, content: resolved.content });
    }
    effectiveSets.push(effective);
  }

  const root = cache.get("AGENTS.md");
  if (root?.kind !== "ok") return { qualified: false, reasons: ["missing-guidance:AGENTS.md"] };
  const rootGuidelines = reviewGuidelines(root.content);
  if (rootGuidelines === "missing") {
    return { qualified: false, reasons: ["review-guidelines-missing:AGENTS.md"] };
  }
  if (rootGuidelines === "stale") {
    return { qualified: false, reasons: ["review-guidelines-stale:AGENTS.md"] };
  }
  const signatures = effectiveSets.map((items) => JSON.stringify([...new Set(items.map((item) => item.content))]));
  if (signatures.some((signature) => signature !== signatures[0])) {
    return { qualified: false, reasons: ["conflicting-effective-guidance"] };
  }
  const effective = (effectiveSets[0] ?? [{ path: "AGENTS.md", content: root.content }])
    .filter((item, index, items) => items.findIndex((candidate) => candidate.content === item.content) === index);
  const projectAugmentation = sortByCanonicalBytes(effective);
  const guidancePreimage = ReviewGuidanceDigestPreimageSchema.parse({
    domain: "arc.review-guidance.digest/v2",
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    carrierId: "hosted-codex",
    baseline: STANDARD_REVIEW_BASELINE_CONTRACT,
    projectAugmentation,
  });
  return {
    qualified: true,
    headSha: input.headSha,
    rubricVersion: CODEX_RUBRIC_VERSION,
    rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    targets,
    guidancePaths: effective.map((item) => item.path),
    baseline: STANDARD_REVIEW_BASELINE_CONTRACT,
    projectAugmentation,
    guidanceDigest: canonicalDigest(guidancePreimage),
    digest: hashContent(JSON.stringify(effective)),
  };
}
