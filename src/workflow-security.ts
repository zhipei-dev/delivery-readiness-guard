import { parse } from 'yaml';
import type { Result, SafeFs } from './types.js';

type Mapping = Record<string, unknown>;

const workflowPaths = (fs: SafeFs): string[] =>
  fs.files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file));

function mapping(value: unknown): Mapping | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Mapping
    : undefined;
}

async function parsedWorkflow(fs: SafeFs, file: string): Promise<Mapping | undefined> {
  const text = await fs.readText(file);
  if (text === undefined) return undefined;
  try {
    return mapping(parse(text));
  } catch {
    return undefined;
  }
}

function permissionBoundary(value: unknown): 'EXPLICIT' | 'WRITE_ALL' | 'INVALID' {
  if (value === 'read-all') return 'EXPLICIT';
  if (value === 'write-all') return 'WRITE_ALL';
  if (mapping(value)) return 'EXPLICIT';
  return 'INVALID';
}

export async function workflowPermissionsCheck(fs: SafeFs): Promise<{ result: Result; evidence: string }> {
  const files = workflowPaths(fs);
  if (files.length === 0) return { result: 'NOT_APPLICABLE', evidence: 'No GitHub Actions workflow YAML found' };

  for (const file of files) {
    const workflow = await parsedWorkflow(fs, file);
    if (!workflow) return { result: 'FAIL', evidence: `${file}: unreadable or invalid workflow YAML` };

    const hasTopLevelPermissions = Object.prototype.hasOwnProperty.call(workflow, 'permissions');
    if (hasTopLevelPermissions) {
      const boundary = permissionBoundary(workflow.permissions);
      if (boundary === 'WRITE_ALL') return { result: 'FAIL', evidence: `${file}: top-level permissions uses write-all` };
      if (boundary !== 'EXPLICIT') return { result: 'FAIL', evidence: `${file}: invalid explicit permissions declaration` };
    }

    const jobs = mapping(workflow.jobs);
    if (!jobs || Object.keys(jobs).length === 0) {
      if (!hasTopLevelPermissions) {
        return { result: 'FAIL', evidence: `${file}: no top-level permissions and no jobs to define job-level permissions` };
      }
      continue;
    }

    for (const [jobName, rawJob] of Object.entries(jobs)) {
      const job = mapping(rawJob);
      if (!job) return { result: 'FAIL', evidence: `${file}: job ${jobName} is not a mapping` };
      const hasJobPermissions = Object.prototype.hasOwnProperty.call(job, 'permissions');
      if (!hasTopLevelPermissions && !hasJobPermissions) {
        return { result: 'FAIL', evidence: `${file}: job ${jobName} has no explicit permissions` };
      }
      if (!hasJobPermissions) continue;
      const boundary = permissionBoundary(job.permissions);
      if (boundary === 'WRITE_ALL') return { result: 'FAIL', evidence: `${file}: job ${jobName} uses write-all` };
      if (boundary !== 'EXPLICIT') return { result: 'FAIL', evidence: `${file}: job ${jobName} has invalid permissions` };
    }
  }

  return { result: 'PASS', evidence: `${files.length} workflow(s) declare explicit non-write-all permissions` };
}

function collectUses(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collectUses(item, found);
    return found;
  }
  const object = mapping(value);
  if (!object) return found;
  for (const [key, child] of Object.entries(object)) {
    if (key === 'uses') found.push(child);
    collectUses(child, found);
  }
  return found;
}

function isImmutableUse(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const use = value.trim();
  if (use.startsWith('./')) return true;
  if (use.startsWith('docker://')) return /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/i.test(use);
  return /^\S+@[0-9a-f]{40}$/i.test(use);
}

export async function actionPinningCheck(fs: SafeFs): Promise<{ result: Result; evidence: string }> {
  const files = workflowPaths(fs);
  if (files.length === 0) return { result: 'NOT_APPLICABLE', evidence: 'No GitHub Actions workflow YAML found' };

  let externalCount = 0;
  for (const file of files) {
    const workflow = await parsedWorkflow(fs, file);
    if (!workflow) return { result: 'FAIL', evidence: `${file}: unreadable or invalid workflow YAML` };

    for (const use of collectUses(workflow)) {
      if (typeof use === 'string' && use.trim().startsWith('./')) continue;
      externalCount += 1;
      if (!isImmutableUse(use)) {
        const shown = typeof use === 'string' ? use.trim().slice(0, 160) : '<non-string uses value>';
        return { result: 'FAIL', evidence: `${file}: mutable action reference ${shown}` };
      }
    }
  }

  if (externalCount === 0) return { result: 'NOT_APPLICABLE', evidence: 'No external action references found' };
  return { result: 'PASS', evidence: `${externalCount} external action reference(s) pinned to immutable digests/commits` };
}
