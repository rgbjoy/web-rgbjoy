import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "contentrichtext_html";
  ALTER TABLE "_posts_v" DROP COLUMN "version_contentrichtext_html";
  ALTER TABLE "info" DROP COLUMN "content_html";
  ALTER TABLE "dev" DROP COLUMN "content_html";
  ALTER TABLE "art" DROP COLUMN "content_html";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "contentrichtext_html" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_contentrichtext_html" varchar;
  ALTER TABLE "info" ADD COLUMN "content_html" varchar;
  ALTER TABLE "dev" ADD COLUMN "content_html" varchar;
  ALTER TABLE "art" ADD COLUMN "content_html" varchar;`)
}
