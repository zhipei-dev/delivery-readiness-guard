import * as core from '@actions/core';
import { writeReport, summary } from './report.js';
import { scan, shouldFail } from './scanner.js';
export async function runAction(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) throw new Error('GITHUB_WORKSPACE is required.');
  const mode = core.getInput('mode') || 'report';
  const report = await scan(workspace, core.getInput('config-path') || '.delivery-readiness.yml');
  const output = await writeReport(workspace, core.getInput('report-path') || 'delivery-readiness-report.json', report);
  core.setOutput('status', report.status);
  core.setOutput('required_failures', report.required_failures);
  core.setOutput('recommended_failures', report.recommended_failures);
  core.setOutput('report_path', output);
  await core.summary.addRaw(summary(report)).write();
  if (shouldFail(mode, report.status)) {
    core.setFailed(`Delivery readiness is ${report.status}: ${report.required_failures} required check(s) failed.`);
  }
}
runAction().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : 'Unexpected action failure.'));
