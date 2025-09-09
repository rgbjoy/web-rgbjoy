import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "media" DROP COLUMN IF EXISTS "prefix";`)
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT 'development';`)
}
