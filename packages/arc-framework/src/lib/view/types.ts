/**
 * Neutral contracts for `arc view` artifact resolution and rendering.
 *
 * @module
 */

import type { Location } from "../work-unit/lifecycle-state.js";

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
  | { status: "absent"; kind: ViewKind }
  | { status: "error"; kind: string; message: string };

export interface ResolvedViewTarget {
  status: "resolved";
  slug: string;
  location: Location;
  metaPath: string;
  taskListPath: string | null;
}

export type ViewTargetResult =
  | ResolvedViewTarget
  | { status: "completed"; slug: string }
  | { status: "unavailable"; slug?: string };

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
  forSlug?: string;
  nonInteractive?: boolean;
}

export interface ViewOutput {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1;
}
