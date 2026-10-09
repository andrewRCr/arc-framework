/**
 * Neutral contracts for `arc view` artifact resolution and rendering.
 *
 * @module
 */

import type { Location } from "../work-unit/lifecycle-state.js";
import type { Slug } from "../kernel/index.js";
import type { WorkUnitPlacement } from "../layout/index.js";

export const VIEW_KINDS = [
  "tasks",
  "spec",
  "draft",
  "meta",
  "notes",
  "cohort",
  "session-notes",
  "working-memory",
  "inbox",
] as const;

export type ViewKind = typeof VIEW_KINDS[number];

export type ViewArtifactResult =
  | { status: "resolved"; kind: ViewKind; path: string; workUnit: string | null }
  | { status: "resolved"; kind: ViewKind; content: string; ref: string; displayLabel: string; workUnit: string | null }
  | { status: "absent"; kind: ViewKind }
  | { status: "error"; kind: string; message: string };

/** A resolved file or reference artifact ready for a viewer destination. */
export type ResolvedViewArtifact = Extract<ViewArtifactResult, { status: "resolved" }>;

export interface ResolvedViewTarget {
  status: "resolved";
  slug: Slug;
  placement: WorkUnitPlacement;
  location: Location;
  metaPath: string;
  taskListPath: string | null;
  artifactSource?: { kind: "checkout"; cwd: string } | { kind: "ref"; ref: string };
}

export type ViewTargetResult =
  | ResolvedViewTarget
  | { status: "completed"; slug: string }
  | { status: "unavailable"; slug?: string; message?: string };

export interface ResolveViewArtifactOptions {
  cwd: string;
  kind?: string;
  project: boolean;
  identity: string | null;
  forSlug?: string;
}

export type ViewArtifactResolver = (
  options: ResolveViewArtifactOptions,
) => Promise<ViewArtifactResult>;

export interface RunViewOptions {
  cwd: string;
  kind?: string;
  project: boolean;
  identity: string | null;
  current?: boolean;
  /** Print the resolved artifact's absolute path instead of its content. */
  path?: boolean;
  /** Open the actual resolved file in the configured editor. */
  editor?: boolean;
  /** Explicit adapter-bound permission to hand off terminal interaction. */
  editorAllowed?: boolean;
  forSlug?: string;
  nonInteractive?: boolean;
}

export interface ViewOutput {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1;
}
