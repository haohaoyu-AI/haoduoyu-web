declare namespace Cloudflare {
  interface Env {
    CLAUDE_CONFIG_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
