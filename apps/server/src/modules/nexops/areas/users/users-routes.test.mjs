import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./routes.ts", import.meta.url);

test("tenant-scoped user profiles retain a bounded avatar and notification preferences", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /avatarDataUrl: z\.string\(\)\.startsWith\("data:image\/"\)\.max\(500_000\)/);
  assert.match(source, /notificationPreferences: notificationPreferencesSchema/);
  assert.match(source, /access\.tenantUserId !== userId && !\["OWNER", "OFFICE_ADMIN"\]/);
});
