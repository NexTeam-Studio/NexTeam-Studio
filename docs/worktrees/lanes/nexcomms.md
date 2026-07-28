# NexComms

Status: Physical worktree created and scope-verified.

## HOW

Owns email and messaging rails, mailbox registration, communication approval execution, and shared message templates.

## WHY

Communication has provider, approval, delivery, and compliance risks that should not be embedded in Clients, Jobs, NexReach, or Nexi.

## SUPPORT

Record mailbox connection, delivery failure, approval, and retry guidance here. Never record credentials, tokens, or real message contents.

## CONTRACTS

Other modules request approved communication through typed commands. NexComms owns provider delivery and returns status without exposing provider secrets.

## KNOWN GOOD

Verified baseline: `9b2132c`. Worktree `nexcomms`, branch `codex/lane/nexcomms`; clean checkout and scope guard passed.
