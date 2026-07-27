import { logger } from "@nexteam/core";
import { app } from "./composeServerApp.js";

export { app };

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    logger.info({
      tenantId: process.env.TENANT_ID,
      module: "server",
      op: "listen",
      latencyMs: 0,
      ok: true,
      port
    });
  });
}
