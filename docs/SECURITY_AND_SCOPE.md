# Security and scope

Scanning is local and deterministic. The scanner resolves all user-controlled paths below `GITHUB_WORKSPACE`, rejects traversal and existing symbolic-link ancestors, requires a real (non-symlink) workspace root, skips symbolic links, caps traversal at 10,000 entries, and reads no Markdown/text file larger than 1 MiB. It never executes checked-repository code, uses shell execution, evaluates target content, dynamically imports target modules, sends content over the network, or reports file contents. Evidence consists only of short paths and reasons.

Path checks are best-effort local safety checks. As with ordinary filesystem operations, they cannot eliminate filesystem changes made concurrently after validation (TOCTOU races).
