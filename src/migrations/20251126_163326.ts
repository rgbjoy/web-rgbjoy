import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" RENAME COLUMN "slug_lock" TO "generate_slug";
  ALTER TABLE "_posts_v" RENAME COLUMN "version_slug_lock" TO "version_generate_slug";
  DROP INDEX "posts_slug_idx";
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" RENAME COLUMN "generate_slug" TO "slug_lock";
  ALTER TABLE "_posts_v" RENAME COLUMN "version_generate_slug" TO "version_slug_lock";
  DROP INDEX "posts_slug_idx";
  CREATE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");`)
}
