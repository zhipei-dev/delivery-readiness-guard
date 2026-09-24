import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScanReport } from './types.js';
import { assertNoSymlinkAncestors } from './fs-safe.js';
export async function writeReport(workspace: string, reportPath: string, report: ScanReport): Promise<string> {
  const output = await assertNoSymlinkAncestors(workspace, reportPath);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return output;
}

export function summary(report: ScanReport): string {
  const rows = report.checks
    .map((check) => `| ${check.id} | ${check.severity} | ${check.result} | ${check.evidence.replaceAll('|', '\\|')} |`)
    .join('\n');
  return `## Delivery Readiness Guard\n\n**Status: ${report.status}**  \nRequired failures: ${report.required_failures} · Recommended failures: ${report.recommended_failures}\n\n| Check | Severity | Result | Evidence |\n| --- | --- | --- | --- |\n${rows}\n`;
}
