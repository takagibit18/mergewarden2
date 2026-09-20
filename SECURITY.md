# Security boundary

The scaffold does not sandbox Pi or implement production source access.
Do not run real untrusted repositories through the session starter before admission/source tools are implemented.
Do not load target `.pi`, AGENTS.md, project plugins, package scripts or imports as trusted instructions.
Never pass GitHub write credentials to a model-controlled command executor.
Graph parsing is static; test execution requires separate resource/network isolation.
State/logs may contain proprietary code. Select explicit retention and redaction rules.
A local engine still sends selected inputs to any configured remote model provider.

Potential issues should initially be reported privately to the repository owner. No contact address
or external security endpoint is invented here; configure one before a public release.
