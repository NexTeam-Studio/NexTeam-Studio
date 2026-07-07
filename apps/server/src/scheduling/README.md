# Scheduling Module

This module owns M3 Scheduling for NexTeam Studio. It suggests availability, checks conflicts, estimates drive time, parks booking/reminder/on-my-way notifications in the ApprovalQueue, and exposes scheduling tools to Nexi.

It connects to the rest of the system through `@nexteam/core` `Visit` records, native in-memory scheduling state for the current slice, Google Maps Distance Matrix when `GOOGLE_MAPS_API_KEY` is configured, and `ApprovalQueueService` for any client notification. It must not write back to Jobber or send messages directly; every outbound scheduling message remains a pending approval item until a separate approved executor handles it.

When something breaks, start with `schedulingEngine.ts` for slot/conflict/drive-time logic, `repository.ts` for native visit state, `routes.ts` for API behavior, `notifications.ts` for ApprovalQueue message shape, and `nexiTools.ts` for assistant tool input mapping.
