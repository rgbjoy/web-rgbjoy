import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "footer_links" RENAME COLUMN "label" TO "title";`)
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "footer_links" RENAME COLUMN "title" TO "label";`)
}
