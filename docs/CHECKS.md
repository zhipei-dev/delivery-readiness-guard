# Checks

Required: `readme`, `setup_guidance`, `run_guidance`, `test_guidance`, `ci_workflow`, `automated_tests`, `environment_guidance`, `deployment_guidance`.

Recommended: `dependency_lock`, `security_guidance`, `support_guidance`, `architecture_guidance`, `limitations_guidance`.

Guidance checks look for meaningful Markdown headings in README or docs-like Markdown, not isolated keywords. Setup, run, and test guidance also require a recognizable command in the same Markdown section; commands elsewhere in the document do not count. CI requires a YAML file under `.github/workflows`. Tests use conventional JS/TS, Python, .NET, Java, Go, and Rust test paths/names without running them. Environment evidence accepts `.env.example`, `.env.sample`, or `.env.template`; deployment accepts `DEPLOYMENT.md`, runbook/handoff files, or a relevant heading. Standard files such as `SECURITY.md` and `SUPPORT.md` satisfy their matching recommended checks.

Lock evidence is ecosystem-aware: Node lockfiles, `Cargo.lock`, `go.sum`, and Python `poetry.lock`, `pdm.lock`, `Pipfile.lock`, or `uv.lock` are checked only when their manifest exists. A Python `requirements*.txt` file is accepted only when every actual requirement is explicitly `==` pinned. Maven and .NET return `NOT_APPLICABLE` because there is no single standard lockfile requirement.
