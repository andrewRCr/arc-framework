/** Filesystem boundaries for owned raw source presentation. */
import type { BigIntStats } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeEnvironmentCaptureIO, type EnvironmentCaptureIO } from "../environment-file.js";

/** Filesystem operations whose failures or concurrent changes affect source capture. */
export interface SourcePresentationIO {
  files: EnvironmentCaptureIO;
  platform: NodeJS.Platform;
  lstat(path: string): Promise<BigIntStats>;
  stat(path: string): Promise<BigIntStats>;
  realpath(path: string): Promise<string>;
  readDirectory(path: string): Promise<Uint8Array[]>;
  readManifest(path: string): Promise<Uint8Array>;
  readlink(path: string): Promise<Uint8Array>;
  symlink(target: string, path: string, type: "file" | "dir"): Promise<void>;
  mkdir(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  writeManifest(path: string, content: string): Promise<void>;
}

/** Native source storage uses a private owner directory and exclusive output files. */
export const nodeSourcePresentationIO: SourcePresentationIO = {
  files: { ...nodeEnvironmentCaptureIO, createDirectory: () => mkdtemp(join(tmpdir(), "arc-check-source-")) },
  platform: process.platform,
  lstat: path => lstat(path, { bigint: true }),
  stat: path => stat(path, { bigint: true }),
  realpath,
  readDirectory: path => readdir(path, { encoding: "buffer" }),
  readManifest: path => readFile(path),
  readlink: path => readlink(path, { encoding: "buffer" }),
  symlink,
  mkdir: async path => { await mkdir(path, { recursive: true }); },
  chmod,
  writeManifest: (path, content) => writeFile(path, content, { flag: "wx", mode: 0o600 }),
};
