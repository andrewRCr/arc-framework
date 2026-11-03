/** Editor handles retained across projection moves, with unconditional cleanup before fixture removal. */
import { open, type FileHandle } from "node:fs/promises";

/** Track a test's editor handles even when its save is skipped or fails before closing them. */
export function createEditorHandles() {
  const handles: FileHandle[] = [];
  return {
    async open(file: string): Promise<FileHandle> {
      const handle = await open(file, "r+");
      handles.push(handle);
      return handle;
    },
    async closeAll(): Promise<void> {
      await Promise.all(handles.splice(0).map((handle) => handle.close()));
    },
  };
}
