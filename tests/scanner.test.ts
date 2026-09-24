import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { createSafeFs } from '../src/fs-safe.js';
import { summary, writeReport } from '../src/report.js';
import { scan, shouldFail } from '../src/scanner.js';

const fixture = (name: string) => path.resolve('tests/fixtures', name);
const tempWorkspace = () => mkdtemp(path.join(tmpdir(), 'drg-'));
async function dependencyResult(workspace: string): Promise<string | undefined> {
  return (await scan(workspace)).checks.find((check) => check.id === 'dependency_lock')?.result;
}

test('ready fixture is READY', async () => assert.equal((await scan(fixture('ready'))).status, 'READY'));
test('not-ready fixture is NOT_READY', async () => assert.equal((await scan(fixture('not-ready'))).status, 'NOT_READY'));
test('recommended-only absence is REVIEW_REQUIRED', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, '.delivery-readiness.yml'), 'version: 1\nrequired_checks: []\nrecommended_checks: [security_guidance]\n');
  assert.equal((await scan(workspace)).status, 'REVIEW_REQUIRED');
});
test('config override is applied', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, '.delivery-readiness.yml'), 'version: 1\nrequired_checks: [readme]\nrecommended_checks: []\n');
  await writeFile(path.join(workspace, 'README.md'), 'x');
  const report = await scan(workspace);
  assert.equal(report.status, 'READY');
  assert.equal(report.checks.length, 1);
});
test('unknown and duplicate config IDs reject', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, 'bad.yml'), 'version: 1\nrequired_checks: [nope]\n');
  await assert.rejects(loadConfig(workspace, 'bad.yml'), /Unknown/);
  await writeFile(path.join(workspace, 'duplicate.yml'), 'version: 1\nrequired_checks: [readme]\nrecommended_checks: [readme]\n');
  await assert.rejects(loadConfig(workspace, 'duplicate.yml'), /both/);
});
test('scan skips symlinks and ignored generated directories', async (context) => {
  const workspace = await tempWorkspace();
  const outside = await tempWorkspace();
  await writeFile(path.join(outside, 'README.md'), 'outside');
  await mkdir(path.join(workspace, '.git'));
  await mkdir(path.join(workspace, 'node_modules'));
  await writeFile(path.join(workspace, '.git', 'README.md'), 'git evidence');
  await writeFile(path.join(workspace, 'node_modules', 'README.md'), 'module evidence');
  try {
    await symlink(outside, path.join(workspace, 'linked'), 'junction');
  } catch {
    context.skip('Symlink creation unavailable on this runner');
    return;
  }
  const fs = await createSafeFs(workspace);
  assert.equal(fs.files.some((file) => file.includes('linked')), false);
  assert.equal(fs.files.some((file) => file.startsWith('.git/')), false);
  assert.equal(fs.files.some((file) => file.startsWith('node_modules/')), false);
  assert.equal(fs.files.length, 0);
});
test('config and report traversal are rejected', async () => {
  const workspace = await tempWorkspace();
  await assert.rejects(loadConfig(workspace, '../bad.yml'), /escapes/);
  await assert.rejects(writeReport(workspace, '../report.json', await scan(workspace)), /escapes/);
});
test('config and report reject existing symlink ancestors', async (context) => {
  const workspace = await tempWorkspace();
  const outside = await tempWorkspace();
  try {
    await symlink(outside, path.join(workspace, 'linked'), 'junction');
  } catch {
    context.skip('Symlink creation unavailable on this runner');
    return;
  }
  await assert.rejects(loadConfig(workspace, 'linked/config.yml'), /symbolic link/);
  await assert.rejects(writeReport(workspace, 'linked/report.json', await scan(workspace)), /symbolic link/);
});
test('oversize text is not read', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, 'README.md'), 'x'.repeat(1024 * 1024 + 1));
  const fs = await createSafeFs(workspace);
  assert.equal(await fs.readText('README.md'), undefined);
});
test('guidance command evidence must stay in its own section', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, '.delivery-readiness.yml'), 'version: 1\nrequired_checks: [setup_guidance]\nrecommended_checks: []\n');
  await writeFile(path.join(workspace, 'README.md'), '# Setup\nInstall dependencies.\n\n# Other\n```sh\nnpm install\n```\n');
  assert.equal((await scan(workspace)).status, 'NOT_READY');
  await writeFile(path.join(workspace, 'README.md'), '# Setup\n```sh\nnpm install\n```\n\n# Other\nNotes.\n');
  assert.equal((await scan(workspace)).status, 'READY');
});
test('Node lock evidence passes', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, 'package.json'), '{}');
  await writeFile(path.join(workspace, 'package-lock.json'), '{}');
  assert.equal(await dependencyResult(workspace), 'PASS');
});
test('Python unpinned requirements fail and pinned requirements pass', async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, 'requirements.txt'), 'requests>=2\n');
  assert.equal(await dependencyResult(workspace), 'FAIL');
  await writeFile(path.join(workspace, 'requirements.txt'), '# pinned\nrequests==2.32.0\nurllib3==2.2.1\n');
  assert.equal(await dependencyResult(workspace), 'PASS');
});
test('Maven and .NET lock evidence is not applicable', async () => {
  const maven = await tempWorkspace();
  const dotnet = await tempWorkspace();
  await writeFile(path.join(maven, 'pom.xml'), '<project/>');
  await writeFile(path.join(dotnet, 'App.csproj'), '<Project/>');
  assert.equal(await dependencyResult(maven), 'NOT_APPLICABLE');
  assert.equal(await dependencyResult(dotnet), 'NOT_APPLICABLE');
});
test('report JSON and report/enforce semantics', async () => {
  const report = await scan(fixture('ready'));
  assert.equal(report.schema_version, 1);
  assert.match(summary(report), /\| Check \|/);
  const workspace = await tempWorkspace();
  const saved = await writeReport(workspace, 'report.json', report);
  const parsed = JSON.parse(await readFile(saved, 'utf8')) as { status: string; schema_version: number };
  assert.equal(parsed.status, 'READY');
  assert.equal(parsed.schema_version, 1);
  assert.equal(shouldFail('report', 'NOT_READY'), false);
  assert.equal(shouldFail('enforce', 'NOT_READY'), true);
  assert.equal(shouldFail('enforce', 'READY'), false);
});
