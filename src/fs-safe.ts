import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SafeFs } from './types.js';

const MAX_ENTRIES = 10_000;
const MAX_TEXT_BYTES = 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'target',
  'bin',
  'obj',
  '.next',
  'coverage',
  '.cache',
  '.venv',
  'venv',
]);

export function safeWorkspacePath(workspace: string, requested: string): string {
  if (!requested || path.isAbsolute(requested)) throw new Error('Path must be a non-empty workspace-relative path.');
  const root = path.resolve(workspace);
  const resolved = path.resolve(root, requested);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('Path escapes GITHUB_WORKSPACE.');
  return resolved;
}

/** Reject existing symbolic-link components before reading or writing a user path. */
export async function assertNoSymlinkAncestors(workspace: string, requested: string): Promise<string> {
  const root = path.resolve(workspace);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('GITHUB_WORKSPACE must be a real directory.');
  }
  const resolved = safeWorkspacePath(root, requested);
  const parts = path.relative(root, resolved).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Path contains a symbolic link.');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return resolved;
}

export async function createSafeFs(workspace: string): Promise<SafeFs> {
  const root = path.resolve(workspace);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('GITHUB_WORKSPACE must be a real directory.');
  const files: string[] = [];
  let entries = 0;
  const walk = async (absolute: string): Promise<void> => {
    const children = await readdir(absolute, { withFileTypes: true });
    for (const child of children) {
      if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) continue;
      if (++entries > MAX_ENTRIES) {
        throw new Error(`Workspace exceeds safe scan limit of ${MAX_ENTRIES} entries.`);
      }
      const target = path.join(absolute, child.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) await walk(target);
      else if (child.isFile()) files.push(relative);
    }
  };
  await walk(root);
  const fileSet = new Set(files);
  return {
    workspace: root,
    files,
    async readText(relative) {
      if (!fileSet.has(relative)) return undefined;
      const absolute = safeWorkspacePath(root, relative);
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEXT_BYTES) return undefined;
      return readFile(absolute, 'utf8');
    }
  };
}
