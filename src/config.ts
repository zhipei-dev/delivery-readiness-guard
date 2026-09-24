import { parse } from 'yaml';
import type { CheckId, Config } from './types.js';
import { assertNoSymlinkAncestors } from './fs-safe.js';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const REQUIRED_DEFAULT: CheckId[] = ['readme', 'setup_guidance', 'run_guidance', 'test_guidance', 'ci_workflow', 'automated_tests', 'environment_guidance', 'deployment_guidance'];
export const RECOMMENDED_DEFAULT: CheckId[] = ['dependency_lock', 'security_guidance', 'support_guidance', 'architecture_guidance', 'limitations_guidance'];
export const ALL_CHECKS = new Set<CheckId>([...REQUIRED_DEFAULT, ...RECOMMENDED_DEFAULT]);

function checkList(value: unknown, key: string): CheckId[] {
  if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) throw new Error(`${key} must be an array of known check IDs.`);
  const ids = value as CheckId[];
  for (const id of ids) if (!ALL_CHECKS.has(id)) throw new Error(`Unknown check ID: ${id}`);
  if (new Set(ids).size !== ids.length) throw new Error(`${key} contains a duplicate check ID.`);
  return ids;
}
export async function loadConfig(workspace: string, configPath: string): Promise<Config> {
  const absolute = await assertNoSymlinkAncestors(workspace, configPath);
  let stat;
  try { stat = await lstat(absolute); } catch (e: unknown) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { required: REQUIRED_DEFAULT, recommended: RECOMMENDED_DEFAULT }; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('Configuration must be a regular YAML file up to 1 MiB.');
  const value = parse(await readFile(absolute, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a YAML mapping.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1) throw new Error('Configuration version must be 1.');
  for (const key of Object.keys(data)) if (!['version', 'required_checks', 'recommended_checks'].includes(key)) throw new Error(`Unsupported configuration key: ${key}`);
  const required = data.required_checks === undefined ? REQUIRED_DEFAULT : checkList(data.required_checks, 'required_checks');
  const recommended = data.recommended_checks === undefined ? RECOMMENDED_DEFAULT : checkList(data.recommended_checks, 'recommended_checks');
  for (const id of required) if (recommended.includes(id)) throw new Error(`Check ID is both required and recommended: ${id}`);
  return { required, recommended };
}
