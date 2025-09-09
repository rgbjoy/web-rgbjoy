import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   CREATE TABLE IF NOT EXISTS "info_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_title" varchar NOT NULL,
  	"link_url" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "info_strengths" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"strengths_list" varchar NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "info" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile_image_id" integer,
  	"content" jsonb,
  	"content_html" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE IF NOT EXISTS "dev_past_projects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"link_url" varchar NOT NULL,
  	"description" varchar
  );

  CREATE TABLE IF NOT EXISTS "dev" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  DO $$ BEGIN
   ALTER TABLE "info_links" ADD CONSTRAINT "info_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."info"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "info_strengths" ADD CONSTRAINT "info_strengths_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."info"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "info" ADD CONSTRAINT "info_profile_image_id_media_id_fk" FOREIGN KEY ("profile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "dev_past_projects" ADD CONSTRAINT "dev_past_projects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dev"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "info_links_order_idx" ON "info_links" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "info_links_parent_id_idx" ON "info_links" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "info_strengths_order_idx" ON "info_strengths" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "info_strengths_parent_id_idx" ON "info_strengths" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "info_profile_image_idx" ON "info" USING btree ("profile_image_id");
  CREATE INDEX IF NOT EXISTS "dev_past_projects_order_idx" ON "dev_past_projects" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "dev_past_projects_parent_id_idx" ON "dev_past_projects" USING btree ("_parent_id");`)
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   DROP TABLE "info_links" CASCADE;
  DROP TABLE "info_strengths" CASCADE;
  DROP TABLE "info" CASCADE;
  DROP TABLE "dev_past_projects" CASCADE;
  DROP TABLE "dev" CASCADE;`)
}
