import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema:['./db/legacy/schema.ts','./db/schema.ts'], out:'./drizzle', dialect:'sqlite' });
