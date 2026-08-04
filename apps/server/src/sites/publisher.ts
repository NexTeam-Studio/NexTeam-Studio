import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { RailError } from "@nexteam/core";
import { z } from "zod";

const require = createRequire(import.meta.url);

const ftpsTargetSchema = z.object({
  host: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  port: z.number().int().positive().default(21),
  remoteDirectory: z.string().min(1).default(".")
}).strict();
const ftpsTargetsSchema = z.record(ftpsTargetSchema);

export type FtpsPublishTarget = z.infer<typeof ftpsTargetSchema>;

export interface StaticSitePublishFile {
  path: string;
  body: Buffer;
}

export interface StaticSitePublishBundle {
  files: StaticSitePublishFile[];
  contentHash: string;
}

export interface SitePublisher {
  publish(target: FtpsPublishTarget, bundle: StaticSitePublishBundle): Promise<{
    filesPublished: number;
    contentHash: string;
  }>;
}

function safeAssetPath(tenantId: string, assetUrl: string): string {
  const prefix = `/tenant-packs/${tenantId}/assets/`;
  if (!assetUrl.startsWith(prefix)) {
    throw new RailError("Site contains an asset outside its tenant package.", { provider: "native", op: "buildPublishBundle", status: 400 });
  }
  const relative = assetUrl.slice(prefix.length);
  if (!relative || relative.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new RailError("Site contains an unsafe asset path.", { provider: "native", op: "buildPublishBundle", status: 400 });
  }
  return relative;
}

function referencedTenantAssets(tenantId: string, html: string): string[] {
  const prefix = `/tenant-packs/${tenantId}/assets/`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`${escapedPrefix}[^'\"\\s)]+`, "g");
  return [...new Set((html.match(expression) ?? []).map((match) => safeAssetPath(tenantId, match)))];
}

export async function buildStaticSitePublishBundle(input: {
  tenantId: string;
  html: string;
  assetRoot: string;
}): Promise<StaticSitePublishBundle> {
  const assets = referencedTenantAssets(input.tenantId, input.html);
  const prefix = `/tenant-packs/${input.tenantId}/assets/`;
  const html = input.html.replaceAll(prefix, "assets/");
  const files: StaticSitePublishFile[] = [{ path: "index.html", body: Buffer.from(html, "utf8") }];

  for (const asset of assets) {
    const source = path.resolve(input.assetRoot, "tenant-packs", input.tenantId, "assets", asset);
    const expectedRoot = `${path.resolve(input.assetRoot, "tenant-packs", input.tenantId, "assets")}${path.sep}`;
    if (!source.startsWith(expectedRoot)) {
      throw new RailError("Site asset resolved outside its tenant package.", { provider: "native", op: "buildPublishBundle", status: 400 });
    }
    try {
      files.push({ path: `assets/${asset}`, body: await readFile(source) });
    } catch {
      throw new RailError(`Site asset ${asset} is not available for publishing.`, { provider: "native", op: "buildPublishBundle", status: 409 });
    }
  }

  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path); hash.update("\0"); hash.update(file.body); hash.update("\0");
  }
  return { files, contentHash: hash.digest("hex") };
}

export function ftpsTargetForTenant(env: NodeJS.ProcessEnv, tenantId: string): FtpsPublishTarget {
  const tenantKey = tenantId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
  const tenantTarget = {
    host: env[`NEXREACH_FTPS_${tenantKey}_HOST`],
    username: env[`NEXREACH_FTPS_${tenantKey}_USERNAME`],
    password: env[`NEXREACH_FTPS_${tenantKey}_PASSWORD`],
    port: env[`NEXREACH_FTPS_${tenantKey}_PORT`],
    remoteDirectory: env[`NEXREACH_FTPS_${tenantKey}_REMOTE_DIRECTORY`]
  };
  if (tenantTarget.host || tenantTarget.username || tenantTarget.password) {
    try {
      return ftpsTargetSchema.parse({
        ...tenantTarget,
        ...(tenantTarget.port ? { port: Number(tenantTarget.port) } : {}),
        ...(tenantTarget.remoteDirectory ? { remoteDirectory: tenantTarget.remoteDirectory } : {})
      });
    } catch {
      throw new RailError("Publishing credentials are not configured for this tenant.", { provider: "native", op: "loadPublishTarget", status: 409 });
    }
  }

  // Backward-compatible only. New tenants use the separate, tenant-scoped variables above.
  const source = env.NEXREACH_FTPS_TARGETS_JSON;
  if (!source) {
    throw new RailError("Publishing credentials are not configured for this tenant.", { provider: "native", op: "loadPublishTarget", status: 409 });
  }
  try {
    const target = ftpsTargetsSchema.parse(JSON.parse(source))[tenantId];
    if (!target) throw new Error("tenant target missing");
    return target;
  } catch {
    throw new RailError("Publishing credentials are not configured for this tenant.", { provider: "native", op: "loadPublishTarget", status: 409 });
  }
}

function safeRemotePath(value: string): string {
  const normalized = value.replace(/\\\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new RailError("Site publish bundle contains an unsafe destination path.", { provider: "native", op: "publishFtps", status: 400 });
  }
  return normalized;
}

export class ExplicitFtpsSitePublisher implements SitePublisher {
  async publish(target: FtpsPublishTarget, bundle: StaticSitePublishBundle): Promise<{ filesPublished: number; contentHash: string }> {
    let basicFtp: { Client: new () => {
      access(input: { host: string; port: number; user: string; password: string; secure: "explicit"; secureOptions: { rejectUnauthorized: true } }): Promise<void>;
      cd(directory: string): Promise<void>;
      ensureDir(directory: string): Promise<void>;
      uploadFrom(source: Readable, destination: string): Promise<void>;
      close(): void;
    } };
    try {
      basicFtp = require("basic-ftp") as typeof basicFtp;
    } catch {
      throw new RailError("The secure publishing adapter is not installed on this server.", { provider: "native", op: "publishFtps", status: 503 });
    }
    const client = new basicFtp.Client();
    try {
      await client.access({ host: target.host, port: target.port, user: target.username, password: target.password, secure: "explicit", secureOptions: { rejectUnauthorized: true } });
      await client.ensureDir(target.remoteDirectory);
      for (const file of bundle.files) {
        await client.cd(target.remoteDirectory);
        const destination = safeRemotePath(file.path);
        const directory = path.posix.dirname(destination);
        if (directory !== ".") await client.ensureDir(directory);
        // basic-ftp accepts a path or a readable stream. A raw Buffer is not a
        // supported upload source, so preserve the exact bytes in one stream chunk.
        await client.uploadFrom(Readable.from([file.body]), destination);
      }
      return { filesPublished: bundle.files.length, contentHash: bundle.contentHash };
    } finally {
      client.close();
    }
  }
}
