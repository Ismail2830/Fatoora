import "dotenv/config";
import { defineConfig } from "prisma/config";

// Read only by the Prisma CLI (migrate, studio, db seed). The app itself
// connects through the Neon driver adapter in src/lib/db.ts.
// Migrations must use Neon's DIRECT (non-pooled) URL — a pooled connection
// cannot hold the advisory lock Migrate needs.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
