import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Defaults are fine for the walking skeleton. Incremental cache / R2 can be
  // added when there is content worth caching.
});
