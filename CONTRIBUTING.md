# Contributing

Thanks for helping improve Delivery Readiness Guard.

## Best contributions

The most useful reports come from real repositories and include a minimal public or redacted reproduction:

- false positives where valid handoff evidence is reported missing;
- false negatives where important handoff evidence is missed;
- installation, configuration, runtime, or output bugs;
- narrowly scoped deterministic checks backed by repeated repository conventions.

Please use the repository issue templates before opening a code change. Do not include secrets, credentials, private customer data, or proprietary repository content.

## Development

Use Node.js 24 and install the pinned dependency graph:

```sh
npm ci
```

Before opening a pull request, run:

```sh
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

`dist/index.js` is a committed GitHub Action artifact, so source changes that affect runtime behavior must keep `dist/` synchronized.

## Scope

Changes should preserve the Action's deterministic, local, auditable model. It must not execute checked-repository code, upload repository contents, require a hosted backend, or add telemetry.

New checks should have an explicit evidence rule, tests for positive and negative cases, and a documented false-positive/false-negative boundary.
