import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/@payloadcms/db-vercel-postgres'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   CREATE TABLE IF NOT EXISTS "home" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"header" varchar,
  	"subhead" varchar,
  	"intro" jsonb,
  	"intro_html" varchar,
  	"button" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE IF NOT EXISTS "art_artworks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"image_id" integer NOT NULL,
  	"description" varchar
  );

  CREATE TABLE IF NOT EXISTS "art" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"header" varchar,
  	"content" jsonb,
  	"content_html" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "media" ALTER COLUMN "prefix" SET DEFAULT 'development';
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_tablet_filename" varchar;
  ALTER TABLE "posts" ADD COLUMN "featured_image_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured_image_id" integer;
  ALTER TABLE "info" ADD COLUMN "header" varchar;
  ALTER TABLE "dev" ADD COLUMN "header" varchar;
  ALTER TABLE "dev" ADD COLUMN "content_html" varchar;
  DO $$ BEGIN
   ALTER TABLE "art_artworks" ADD CONSTRAINT "art_artworks_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "art_artworks" ADD CONSTRAINT "art_artworks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."art"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "art_artworks_order_idx" ON "art_artworks" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "art_artworks_parent_id_idx" ON "art_artworks" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "art_artworks_image_idx" ON "art_artworks" USING btree ("image_id");
  DO $$ BEGIN
   ALTER TABLE "posts" ADD CONSTRAINT "posts_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_tablet_sizes_tablet_filename_idx" ON "media" USING btree ("sizes_tablet_filename");
  CREATE INDEX IF NOT EXISTS "posts_featured_image_idx" ON "posts" USING btree ("featured_image_id");
  CREATE INDEX IF NOT EXISTS "_posts_v_version_version_featured_image_idx" ON "_posts_v" USING btree ("version_featured_image_id");`)
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.db.drizzle.execute(sql`
   ALTER TABLE "home" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "art_artworks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "art" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "home" CASCADE;
  DROP TABLE "art_artworks" CASCADE;
  DROP TABLE "art" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT "posts_featured_image_id_media_id_fk";

  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_featured_image_id_media_id_fk";

  DROP INDEX IF EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx";
  DROP INDEX IF EXISTS "media_sizes_card_sizes_card_filename_idx";
  DROP INDEX IF EXISTS "media_sizes_tablet_sizes_tablet_filename_idx";
  DROP INDEX IF EXISTS "posts_featured_image_idx";
  DROP INDEX IF EXISTS "_posts_v_version_version_featured_image_idx";
  ALTER TABLE "media" ALTER COLUMN "prefix" SET DEFAULT 'my-prefix';
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_url";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_width";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_height";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_mime_type";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_filesize";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_thumbnail_filename";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_url";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_width";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_height";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_mime_type";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_filesize";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_card_filename";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_url";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_width";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_height";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_mime_type";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_filesize";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "sizes_tablet_filename";
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "featured_image_id";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_featured_image_id";
  ALTER TABLE "info" DROP COLUMN IF EXISTS "header";
  ALTER TABLE "dev" DROP COLUMN IF EXISTS "header";
  ALTER TABLE "dev" DROP COLUMN IF EXISTS "content_html";`)
}
