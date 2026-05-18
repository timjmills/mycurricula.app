// open-next.config.ts — OpenNext adapter config for Cloudflare Workers.
// Minimal config: default in-memory caches, no R2/KV bindings yet.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
