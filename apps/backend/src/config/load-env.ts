import { config } from "dotenv";
import { join } from "node:path";

// Load the monorepo root .env before any module reads process.env.
// This file lives at apps/backend/{src,dist}/config, so the root is 4 levels up.
config({ path: join(import.meta.dirname, "..", "..", "..", "..", ".env") });
