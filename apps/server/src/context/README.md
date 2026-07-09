# Context Tools

This directory holds small tenant-aware tools Nexi uses for real-world context that is not owned by Jobber, CompanyCam, CRM, or email.

Current tools:
- `getCurrentTime`: answers tenant-local date/time questions.
- `getCurrentWeather`: reads current weather through OpenWeather.
- `getDistance`: estimates drive time from the tenant home base, or a supplied origin, to a destination using Google Maps when configured.

Start here when something breaks:
- Check `nexiTools.ts` first for tool schemas, default home-base behavior, and provider selection.
- If Nexi says a context ability is unavailable, check `packages/nexi/src/gateway.ts` to confirm the tool is being selected and registered.
- If live distance or weather fails, verify the Railway staging env vars are present before changing code.
