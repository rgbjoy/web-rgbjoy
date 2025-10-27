import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "dev_playground" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"link_url" varchar NOT NULL,
  	"description" varchar
  );
  
  ALTER TABLE "dev_playground" ADD CONSTRAINT "dev_playground_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."dev"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "dev_playground_order_idx" ON "dev_playground" USING btree ("_order");
  CREATE INDEX "dev_playground_parent_id_idx" ON "dev_playground" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "dev_playground" CASCADE;`)
}
