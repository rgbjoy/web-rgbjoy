import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "home" ALTER COLUMN "intro" SET DATA TYPE varchar;
  ALTER TABLE "home" DROP COLUMN IF EXISTS "intro_html";`)
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "home" ALTER COLUMN "intro" SET DATA TYPE jsonb;
  ALTER TABLE "home" ADD COLUMN "intro_html" varchar;`)
}
