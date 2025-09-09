import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "dev_past_projects" ADD COLUMN "image_id" integer;
  DO $$ BEGIN
   ALTER TABLE "dev_past_projects" ADD CONSTRAINT "dev_past_projects_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "dev_past_projects_image_idx" ON "dev_past_projects" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "dev_past_projects" DROP CONSTRAINT "dev_past_projects_image_id_media_id_fk";

  DROP INDEX IF EXISTS "dev_past_projects_image_idx";
  ALTER TABLE "dev_past_projects" DROP COLUMN IF EXISTS "image_id";`)
}
