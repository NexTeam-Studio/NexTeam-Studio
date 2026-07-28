# Component Worktree Standard

NexTeam uses one integration lane plus component lanes. A lane is a Git worktree and branch assigned to one clearly named part of the product. The complete lane registry is `worktree-lanes.json`.

## What a lane owns

Each component lane owns only the paths listed in the registry. It may call another component through that component's public contract, but it may not edit or import the other component's internal implementation. Cross-component changes are coordinated in the integration lane.

## Required lane record

Every lane has a living record under `docs/worktrees/lanes/<lane>.md`. Keep these sections current:

- HOW: what the component does, where its code lives, how to run it, and how other components call it.
- WHY: why its boundary exists and why important decisions were made.
- SUPPORT: user questions, common failures, and safe recovery steps written without engineering jargon.
- CONTRACTS: public commands, queries, and events exposed to Nexi or other components.
- KNOWN GOOD: the last verified commit, tests run, and any open limitations.

These records are the source material for Nexi support answers and future NexTeam website/community help content. They must never contain credentials, private tenant information, or copied production data.

## Working safely

Run `npm run check:worktree-scope` before committing. A component lane should not modify another lane's files. Commit working checkpoints in the component branch, then integrate through `codex/target-architecture-integration` after build and test verification.
