export type Severity = 'REQUIRED' | 'RECOMMENDED';
export type Result = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
export type Status = 'READY' | 'REVIEW_REQUIRED' | 'NOT_READY';
export type CheckId =
  | 'readme' | 'setup_guidance' | 'run_guidance' | 'test_guidance' | 'ci_workflow'
  | 'automated_tests' | 'environment_guidance' | 'deployment_guidance' | 'dependency_lock'
  | 'security_guidance' | 'support_guidance' | 'architecture_guidance' | 'limitations_guidance';

export interface CheckResult { id: CheckId; severity: Severity; result: Result; evidence: string; }
export interface ScanReport {
  schema_version: 1; generated_at: string; status: Status;
  required_failures: number; recommended_failures: number; checks: CheckResult[];
}
export interface Config { required: CheckId[]; recommended: CheckId[]; }
export interface SafeFs {
  workspace: string;
  files: string[];
  readText(relative: string): Promise<string | undefined>;
}
