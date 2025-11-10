import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "art_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"title" varchar,
  	"description" varchar
  );
  
  ALTER TABLE "art_artworks" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "art_artworks" CASCADE;
  ALTER TABLE "media" ALTER COLUMN "alt" SET DEFAULT 'Image';
  ALTER TABLE "media" ALTER COLUMN "alt" DROP NOT NULL;
  ALTER TABLE "art_gallery" ADD CONSTRAINT "art_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "art_gallery" ADD CONSTRAINT "art_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."art"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "art_gallery_order_idx" ON "art_gallery" USING btree ("_order");
  CREATE INDEX "art_gallery_parent_id_idx" ON "art_gallery" USING btree ("_parent_id");
  CREATE INDEX "art_gallery_image_idx" ON "art_gallery" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "art_artworks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"image_id" integer NOT NULL,
  	"description" varchar
  );
  
  ALTER TABLE "art_gallery" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "art_gallery" CASCADE;
  ALTER TABLE "media" ALTER COLUMN "alt" DROP DEFAULT;
  ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
  ALTER TABLE "art_artworks" ADD CONSTRAINT "art_artworks_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "art_artworks" ADD CONSTRAINT "art_artworks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."art"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "art_artworks_order_idx" ON "art_artworks" USING btree ("_order");
  CREATE INDEX "art_artworks_parent_id_idx" ON "art_artworks" USING btree ("_parent_id");
  CREATE INDEX "art_artworks_image_idx" ON "art_artworks" USING btree ("image_id");`)
}
