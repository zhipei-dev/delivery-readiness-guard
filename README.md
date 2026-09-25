# Delivery Readiness Guard

A free, deterministic GitHub Action that checks whether a repository has the basic evidence needed for a client, incoming developer, or operations-team handoff. It is not an AI reviewer, secret scanner, or generic health score.

## Why

Handoffs fail when essential operational knowledge is implicit. This action makes a small, auditable baseline visible in pull requests and delivery workflows without executing repository code.

## What it checks

Required checks cover a root README, setup/run/test guidance, CI workflow, conventional test evidence, environment guidance, and deployment guidance. Recommended checks cover lockfiles where applicable plus security, support, architecture, and limitations guidance. Two opt-in workflow-security checks are also available: explicit GitHub Actions permissions and immutable external `uses:` references. They are not enabled by default, so upgrading does not silently change existing readiness status. See [the full check rules](docs/CHECKS.md).

## Quick start

```yaml
name: delivery-readiness
on: [pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: zhipei-dev/delivery-readiness-guard@v1
        with:
          mode: report
```

`contents: read` is the minimal permission. The JSON report is written in the workspace and a concise result table is added to the job summary.

## Report and enforce

`mode: report` (the default) never fails for readiness findings. `mode: enforce` fails only when one or more required checks fail. Invalid configuration and safety-boundary errors always fail.

## Configuration

Optional `.delivery-readiness.yml` supports only check placement:

```yaml
version: 1
required_checks: [readme, setup_guidance]
recommended_checks: [security_guidance, workflow_permissions, action_pinning]
```

Unknown IDs and duplicated placement are errors. An empty `required_checks` is allowed, but means readiness cannot become `NOT_READY`; use it deliberately. `workflow_permissions` and `action_pinning` are optional checks that can be placed in either list. `workflow_permissions` requires an explicit non-`write-all` permission boundary at workflow level or on every job; it does not reject narrowly scoped intentional write permissions. `action_pinning` requires external actions/reusable workflows to use a full 40-character commit SHA and Docker actions to use a `sha256` digest; local `./` actions are allowed. Inputs are `mode`, `config-path`, and `report-path`.

## Outputs

`status` is `READY`, `REVIEW_REQUIRED`, or `NOT_READY`. Also available: `required_failures`, `recommended_failures`, and `report_path`.

## Limitations and false positives

Evidence is intentionally conservative and filename/heading based. v1.1.0 adds opt-in GitHub Actions permission and immutable-reference checks without changing default readiness scoring; the existing setup/run/test guidance rules remain deterministic and require matching command evidence in the same section. It cannot determine whether a command is correct, deployment access works, documentation is current, or tests pass. Review the report rather than treating it as a guarantee.

## Security and privacy

The action scans only `GITHUB_WORKSPACE`, does not follow symlinks, does not execute repository code or shell commands, limits traversal and text reads, and never uploads repository content. Details are in [Security and scope](docs/SECURITY_AND_SCOPE.md).

## External feedback

Real repository evidence drives changes to the Action. If you use `@v1`, please open an Issue when you encounter:

- a **false positive**: valid setup/run/test/deployment evidence is reported missing
- a **false negative**: the Action reports readiness even though important handoff evidence is absent
- an installation/runtime bug
- a narrowly scoped deterministic feature request

The issue templates ask for a minimal public or redacted reproduction. Do not include secrets, credentials, private customer data, or proprietary repository content.

[Open an issue](https://github.com/zhipei-dev/delivery-readiness-guard/issues/new/choose).

## Roadmap

Future releases may refine deterministic ecosystem evidence and documentation heuristics while retaining the action's local, auditable scope.
