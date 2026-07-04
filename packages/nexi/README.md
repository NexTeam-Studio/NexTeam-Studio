# Nexi Package

This package contains the assistant gateway pieces shared by Nexi-facing modules. It is where model constants, source enforcement, tool loop behavior, and usage logging contracts live.

It connects modules to Anthropic through one controlled gateway and uses `@nexteam/core` sources so factual answers can be checked before they reach users. Module-specific tools should be registered outside this package and passed in.

When something breaks, start with `src/gateway.ts` for model calls/tool flow/usageLog, `src/sourceCheck.ts` for missing-source failures, and package tests for cache metric or source enforcement regressions.
