import type { CheckId, Result, SafeFs } from './types.js';
import { actionPinningCheck, workflowPermissionsCheck } from './workflow-security.js';

const nonGuidanceMarkdown = /^\.github\/(?:ISSUE_TEMPLATE\/|PULL_REQUEST_TEMPLATE(?:\.md|\/))/i;
const markdown = (fs: SafeFs) => fs.files.filter((file) => /(^|\/)(readme|[^/]+)\.md$/i.test(file) && !nonGuidanceMarkdown.test(file));
const standard: Partial<Record<CheckId, RegExp>> = {
  security_guidance: /(^|\/)security\.md$/i,
  support_guidance: /(^|\/)support\.md$/i,
  architecture_guidance: /(^|\/)(architecture|design)\.md$/i,
  limitations_guidance: /(^|\/)(limitations|known-issues)\.md$/i,
};
const sectionWords: Partial<Record<CheckId, string[]>> = {
  setup_guidance: ['setup', 'installation', 'getting started', 'quick start', 'quickstart'],
  run_guidance: ['run', 'usage', 'development', 'quick start', 'quickstart'],
  test_guidance: ['test', 'testing', 'validation', 'verification', 'browser validation', 'verified local evidence', 'quick start', 'quickstart'],
  environment_guidance: ['environment', 'configuration', 'secrets'],
  deployment_guidance: ['deployment', 'hosting', 'release', 'handoff'], security_guidance: ['security'],
  support_guidance: ['support', 'contact', 'contributing'], architecture_guidance: ['architecture', 'design'],
  limitations_guidance: ['limitations', 'known issues', 'caveats'],
};
const commandPatterns: Partial<Record<CheckId, RegExp>> = {
  setup_guidance: /(?:^|\n)\s*(?:[$#]\s*)?(?:npm\s+(?:ci|install)\b|pnpm\s+install\b|yarn\s+install\b|(?:pip|pipx)\s+install\b|poetry\s+(?:install|sync)\b|pdm\s+(?:install|sync)\b|uv\s+(?:sync|pip\s+install)\b|dotnet\s+restore\b|(?:mvn|\.\/mvnw)(?:\s+[-\w.=]+)*\s+(?:dependency:\S+|verify)\b|(?:gradle|\.\/gradlew)(?:\s+[-\w.=]+)*\s+(?:build|dependencies)\b|cargo\s+(?:fetch|build)\b|go\s+mod\s+(?:download|tidy)\b|docker\s+compose\s+build\b)/i,
  run_guidance: /(?:^|\n)\s*(?:[$#]\s*)?(?:npm\s+run\s+(?:dev|start|serve)\b|node\s+\S+|python\s+\S+|uvicorn\s+\S+|flask\s+run\b|dotnet\s+run\b|(?:mvn|\.\/mvnw)(?:\s+[-\w.=]+)*\s+spring-boot:run\b|(?:gradle|\.\/gradlew)(?:\s+[-\w.=]+)*\s+(?:bootRun|run)\b|go\s+run\b|cargo\s+run\b|docker\s+compose\s+up\b)/i,
  test_guidance: /(?:^|\n)\s*(?:[$#]\s*)?(?:npm\s+test\b|npm\s+run\s+test[\w:-]*\b|npx\s+playwright\s+test\b|pytest\b|dotnet\s+test\b|(?:mvn|\.\/mvnw)(?:\s+[-\w.=]+)*\s+(?:test|verify)\b|(?:gradle|\.\/gradlew)(?:\s+[-\w.=]+)*\s+(?:test|check)\b|go\s+test\b|cargo\s+test\b)/i,
};
const commandGuidance = new Set<CheckId>(['setup_guidance', 'run_guidance', 'test_guidance']);

function hasCommandEvidence(body: string, id: CheckId): boolean {
  const pattern = commandPatterns[id];
  if (!pattern) return false;
  const blocks = body.match(/```[^`]*```/gs) ?? [];
  return blocks.some((block) => pattern.test(block));
}

function sections(text: string): Array<{ heading: string; body: string }> {
  const lines = text.split(/\r?\n/);
  const found: Array<{ heading: string; body: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (!match) continue;
    const level = match[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const next = /^(#{1,6})\s+/.exec(lines[end]);
      if (next && next[1].length <= level) break;
      end += 1;
    }
    found.push({ heading: match[2].toLowerCase(), body: lines.slice(index + 1, end).join('\n') });
  }
  return found;
}

async function hasSection(fs: SafeFs, id: CheckId): Promise<string | undefined> {
  const words = sectionWords[id];
  if (!words) return undefined;
  for (const file of markdown(fs)) {
    const text = await fs.readText(file);
    if (!text) continue;
    for (const section of sections(text)) {
      if (!words.some((word) => section.heading.includes(word))) continue;
      if (!commandGuidance.has(id) || hasCommandEvidence(section.body, id)) {
        return `${file} (${words.join('/')} heading${commandGuidance.has(id) ? ' + command evidence' : ''})`;
      }
    }
  }
  return undefined;
}

function find(fs: SafeFs, expression: RegExp): string | undefined {
  return fs.files.find((file) => expression.test(file));
}

async function pythonRequirementsPinned(fs: SafeFs): Promise<string | undefined> {
  const requirements = fs.files.filter((file) => /(^|\/)requirements[^/]*\.txt$/i.test(file));
  for (const file of requirements) {
    const text = await fs.readText(file);
    if (text === undefined) continue;
    const requirementsLines = text.split(/\r?\n/)
      .map((line) => line.replace(/\s+#.*$/, '').trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('-'));
    const pinnedRequirement = /^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?\s*===?\s*[^\s;]+(?:\s*;.*)?$/;
    if (requirementsLines.length > 0 && requirementsLines.every((line) => pinnedRequirement.test(line))) return file;
  }
  return undefined;
}

async function dependencyLock(fs: SafeFs): Promise<{ result: Result; evidence: string }> {
  const files = fs.files;
  if (files.some((file) => /(^|\/)package\.json$/i.test(file))) {
    const lock = find(fs, /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i);
    return lock ? { result: 'PASS', evidence: lock } : { result: 'FAIL', evidence: 'Node manifest found but no Node lockfile' };
  }
  if (files.some((file) => /(^|\/)cargo\.toml$/i.test(file))) {
    const lock = find(fs, /(^|\/)cargo\.lock$/i);
    return lock ? { result: 'PASS', evidence: lock } : { result: 'FAIL', evidence: 'Cargo manifest found but Cargo.lock absent' };
  }
  if (files.some((file) => /(^|\/)go\.mod$/i.test(file))) {
    const lock = find(fs, /(^|\/)go\.sum$/i);
    return lock ? { result: 'PASS', evidence: lock } : { result: 'FAIL', evidence: 'go.mod found but go.sum absent' };
  }
  if (files.some((file) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|pipfile)$/i.test(file))) {
    const lock = find(fs, /(^|\/)(poetry\.lock|pdm\.lock|pipfile\.lock|uv\.lock)$/i) ?? await pythonRequirementsPinned(fs);
    return lock ? { result: 'PASS', evidence: lock } : { result: 'FAIL', evidence: 'Python dependencies need a lockfile or fully == pinned requirements' };
  }
  if (files.some((file) => /(^|\/)(pom\.xml|[^/]+\.csproj)$/i.test(file))) return { result: 'NOT_APPLICABLE', evidence: 'Maven/.NET has no single standard lockfile requirement' };
  return { result: 'NOT_APPLICABLE', evidence: 'No supported dependency ecosystem detected' };
}

export async function runCheck(fs: SafeFs, id: CheckId): Promise<{ result: Result; evidence: string }> {
  if (id === 'readme') {
    const file = fs.files.find((candidate) => /^readme\.md$/i.test(candidate));
    return file ? { result: 'PASS', evidence: file } : { result: 'FAIL', evidence: 'Root README.md not found' };
  }
  if (id === 'ci_workflow') {
    const file = find(fs, /^\.github\/workflows\/[^/]+\.ya?ml$/i);
    return file ? { result: 'PASS', evidence: file } : { result: 'FAIL', evidence: 'No workflow YAML under .github/workflows' };
  }
  if (id === 'automated_tests') {
    const file = find(fs, /(^|\/)(__tests__|tests?|test)\/|\.(test|spec)\.[^/]+$|tests?\.cs$/i);
    return file ? { result: 'PASS', evidence: file } : { result: 'FAIL', evidence: 'No conventional automated-test path or filename' };
  }
  if (id === 'environment_guidance') {
    const evidence = find(fs, /(^|\/)\.env\.(example|sample|template)$/i) ?? await hasSection(fs, id);
    return evidence ? { result: 'PASS', evidence } : { result: 'FAIL', evidence: 'No environment example or guidance heading' };
  }
  if (id === 'deployment_guidance') {
    const evidence = find(fs, /(^|\/)(deployment|runbook|handoff)\.md$/i) ?? await hasSection(fs, id);
    return evidence ? { result: 'PASS', evidence } : { result: 'FAIL', evidence: 'No deployment/runbook file or guidance heading' };
  }
  if (id === 'dependency_lock') return dependencyLock(fs);
  if (id === 'workflow_permissions') return workflowPermissionsCheck(fs);
  if (id === 'action_pinning') return actionPinningCheck(fs);
  const evidence = (standard[id] && find(fs, standard[id])) ?? await hasSection(fs, id);
  return evidence ? { result: 'PASS', evidence } : { result: 'FAIL', evidence: `No ${id.replace('_', ' ')} file or guidance heading` };
}
