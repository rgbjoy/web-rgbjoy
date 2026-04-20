import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "info_strengths" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "info_strengths" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"strengths_list" varchar NOT NULL
  );
  
  ALTER TABLE "info_strengths" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "info_strengths" ADD CONSTRAINT "info_strengths_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."info"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "info_strengths_order_idx" ON "info_strengths" USING btree ("_order");
  CREATE INDEX "info_strengths_parent_id_idx" ON "info_strengths" USING btree ("_parent_id");`)
}
