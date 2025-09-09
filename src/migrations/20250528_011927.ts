import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info" ADD COLUMN "resume_id" integer;
  DO $$ BEGIN
   ALTER TABLE "info" ADD CONSTRAINT "info_resume_id_media_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "info_resume_idx" ON "info" USING btree ("resume_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "info" DROP CONSTRAINT "info_resume_id_media_id_fk";

  DROP INDEX IF EXISTS "info_resume_idx";
  ALTER TABLE "info" DROP COLUMN IF EXISTS "resume_id";`)
}
