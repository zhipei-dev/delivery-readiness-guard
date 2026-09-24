import { createSafeFs } from './fs-safe.js';
import { loadConfig } from './config.js';
import { runCheck } from './checks.js';
import type { ScanReport, Status } from './types.js';
export async function scan(workspace: string, configPath = '.delivery-readiness.yml'): Promise<ScanReport> {
  const config = await loadConfig(workspace, configPath);
  const fs = await createSafeFs(workspace);
  const checks = [];
  for (const id of config.required) checks.push({ id, severity: 'REQUIRED' as const, ...(await runCheck(fs, id)) });
  for (const id of config.recommended) checks.push({ id, severity: 'RECOMMENDED' as const, ...(await runCheck(fs, id)) });
  const required_failures = checks.filter((c) => c.severity === 'REQUIRED' && c.result === 'FAIL').length;
  const recommended_failures = checks.filter((c) => c.severity === 'RECOMMENDED' && c.result === 'FAIL').length;
  const status: Status = required_failures ? 'NOT_READY' : recommended_failures ? 'REVIEW_REQUIRED' : 'READY';
  return { schema_version: 1, generated_at: new Date().toISOString(), status, required_failures, recommended_failures, checks };
}
export function shouldFail(mode: string, status: Status): boolean {
  if (!['report', 'enforce'].includes(mode)) throw new Error('mode must be report or enforce.');
  return mode === 'enforce' && status === 'NOT_READY';
}
