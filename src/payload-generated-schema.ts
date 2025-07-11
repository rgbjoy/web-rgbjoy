/* tslint:disable */
/* eslint-disable */
/**
 * This file was automatically generated by Payload.
 * DO NOT MODIFY IT BY HAND. Instead, modify your source Payload config,
 * and re-run `payload generate:db-schema` to regenerate this file.
 */

import type {} from '@payloadcms/db-postgres'
import {
  pgTable,
  index,
  uniqueIndex,
  foreignKey,
  integer,
  varchar,
  timestamp,
  serial,
  numeric,
  jsonb,
  boolean,
  pgEnum,
} from '@payloadcms/db-postgres/drizzle/pg-core'
import { sql, relations } from '@payloadcms/db-postgres/drizzle'
export const enum_users_role = pgEnum('enum_users_role', ['admin', 'editor'])
export const enum_posts_status = pgEnum('enum_posts_status', ['draft', 'published'])
export const enum__posts_v_version_status = pgEnum('enum__posts_v_version_status', [
  'draft',
  'published',
])

export const users_sessions = pgTable(
  'users_sessions',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
    expiresAt: timestamp('expires_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
  (columns) => ({
    _orderIdx: index('users_sessions_order_idx').on(columns._order),
    _parentIDIdx: index('users_sessions_parent_id_idx').on(columns._parentID),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [users.id],
      name: 'users_sessions_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    role: enum_users_role('role').notNull().default('editor'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    email: varchar('email').notNull(),
    resetPasswordToken: varchar('reset_password_token'),
    resetPasswordExpiration: timestamp('reset_password_expiration', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }),
    salt: varchar('salt'),
    hash: varchar('hash'),
    loginAttempts: numeric('login_attempts').default('0'),
    lockUntil: timestamp('lock_until', { mode: 'string', withTimezone: true, precision: 3 }),
  },
  (columns) => ({
    users_updated_at_idx: index('users_updated_at_idx').on(columns.updatedAt),
    users_created_at_idx: index('users_created_at_idx').on(columns.createdAt),
    users_email_idx: uniqueIndex('users_email_idx').on(columns.email),
  }),
)

export const media = pgTable(
  'media',
  {
    id: serial('id').primaryKey(),
    alt: varchar('alt').notNull(),
    prefix: varchar('prefix').default('development'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    url: varchar('url'),
    thumbnailURL: varchar('thumbnail_u_r_l'),
    filename: varchar('filename'),
    mimeType: varchar('mime_type'),
    filesize: numeric('filesize'),
    width: numeric('width'),
    height: numeric('height'),
    focalX: numeric('focal_x'),
    focalY: numeric('focal_y'),
    sizes_thumbnail_url: varchar('sizes_thumbnail_url'),
    sizes_thumbnail_width: numeric('sizes_thumbnail_width'),
    sizes_thumbnail_height: numeric('sizes_thumbnail_height'),
    sizes_thumbnail_mimeType: varchar('sizes_thumbnail_mime_type'),
    sizes_thumbnail_filesize: numeric('sizes_thumbnail_filesize'),
    sizes_thumbnail_filename: varchar('sizes_thumbnail_filename'),
    sizes_card_url: varchar('sizes_card_url'),
    sizes_card_width: numeric('sizes_card_width'),
    sizes_card_height: numeric('sizes_card_height'),
    sizes_card_mimeType: varchar('sizes_card_mime_type'),
    sizes_card_filesize: numeric('sizes_card_filesize'),
    sizes_card_filename: varchar('sizes_card_filename'),
    sizes_tablet_url: varchar('sizes_tablet_url'),
    sizes_tablet_width: numeric('sizes_tablet_width'),
    sizes_tablet_height: numeric('sizes_tablet_height'),
    sizes_tablet_mimeType: varchar('sizes_tablet_mime_type'),
    sizes_tablet_filesize: numeric('sizes_tablet_filesize'),
    sizes_tablet_filename: varchar('sizes_tablet_filename'),
  },
  (columns) => ({
    media_updated_at_idx: index('media_updated_at_idx').on(columns.updatedAt),
    media_created_at_idx: index('media_created_at_idx').on(columns.createdAt),
    media_filename_idx: uniqueIndex('media_filename_idx').on(columns.filename),
    media_sizes_thumbnail_sizes_thumbnail_filename_idx: index(
      'media_sizes_thumbnail_sizes_thumbnail_filename_idx',
    ).on(columns.sizes_thumbnail_filename),
    media_sizes_card_sizes_card_filename_idx: index('media_sizes_card_sizes_card_filename_idx').on(
      columns.sizes_card_filename,
    ),
    media_sizes_tablet_sizes_tablet_filename_idx: index(
      'media_sizes_tablet_sizes_tablet_filename_idx',
    ).on(columns.sizes_tablet_filename),
  }),
)

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    featuredImage: integer('featured_image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    title: varchar('title'),
    publishedAt: timestamp('published_at', { mode: 'string', withTimezone: true, precision: 3 }),
    contentRichText: jsonb('content_rich_text'),
    contentRichText_html: varchar('contentrichtext_html'),
    slug: varchar('slug'),
    slugLock: boolean('slug_lock').default(true),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    _status: enum_posts_status('_status').default('draft'),
  },
  (columns) => ({
    posts_featured_image_idx: index('posts_featured_image_idx').on(columns.featuredImage),
    posts_slug_idx: index('posts_slug_idx').on(columns.slug),
    posts_updated_at_idx: index('posts_updated_at_idx').on(columns.updatedAt),
    posts_created_at_idx: index('posts_created_at_idx').on(columns.createdAt),
    posts__status_idx: index('posts__status_idx').on(columns._status),
  }),
)

export const _posts_v = pgTable(
  '_posts_v',
  {
    id: serial('id').primaryKey(),
    parent: integer('parent_id').references(() => posts.id, {
      onDelete: 'set null',
    }),
    version_featuredImage: integer('version_featured_image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    version_title: varchar('version_title'),
    version_publishedAt: timestamp('version_published_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }),
    version_contentRichText: jsonb('version_content_rich_text'),
    version_contentRichText_html: varchar('version_contentrichtext_html'),
    version_slug: varchar('version_slug'),
    version_slugLock: boolean('version_slug_lock').default(true),
    version_updatedAt: timestamp('version_updated_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }),
    version_createdAt: timestamp('version_created_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }),
    version__status: enum__posts_v_version_status('version__status').default('draft'),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    latest: boolean('latest'),
    autosave: boolean('autosave'),
  },
  (columns) => ({
    _posts_v_parent_idx: index('_posts_v_parent_idx').on(columns.parent),
    _posts_v_version_version_featured_image_idx: index(
      '_posts_v_version_version_featured_image_idx',
    ).on(columns.version_featuredImage),
    _posts_v_version_version_slug_idx: index('_posts_v_version_version_slug_idx').on(
      columns.version_slug,
    ),
    _posts_v_version_version_updated_at_idx: index('_posts_v_version_version_updated_at_idx').on(
      columns.version_updatedAt,
    ),
    _posts_v_version_version_created_at_idx: index('_posts_v_version_version_created_at_idx').on(
      columns.version_createdAt,
    ),
    _posts_v_version_version__status_idx: index('_posts_v_version_version__status_idx').on(
      columns.version__status,
    ),
    _posts_v_created_at_idx: index('_posts_v_created_at_idx').on(columns.createdAt),
    _posts_v_updated_at_idx: index('_posts_v_updated_at_idx').on(columns.updatedAt),
    _posts_v_latest_idx: index('_posts_v_latest_idx').on(columns.latest),
    _posts_v_autosave_idx: index('_posts_v_autosave_idx').on(columns.autosave),
  }),
)

export const payload_locked_documents = pgTable(
  'payload_locked_documents',
  {
    id: serial('id').primaryKey(),
    globalSlug: varchar('global_slug'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (columns) => ({
    payload_locked_documents_global_slug_idx: index('payload_locked_documents_global_slug_idx').on(
      columns.globalSlug,
    ),
    payload_locked_documents_updated_at_idx: index('payload_locked_documents_updated_at_idx').on(
      columns.updatedAt,
    ),
    payload_locked_documents_created_at_idx: index('payload_locked_documents_created_at_idx').on(
      columns.createdAt,
    ),
  }),
)

export const payload_locked_documents_rels = pgTable(
  'payload_locked_documents_rels',
  {
    id: serial('id').primaryKey(),
    order: integer('order'),
    parent: integer('parent_id').notNull(),
    path: varchar('path').notNull(),
    usersID: integer('users_id'),
    mediaID: integer('media_id'),
    postsID: integer('posts_id'),
  },
  (columns) => ({
    order: index('payload_locked_documents_rels_order_idx').on(columns.order),
    parentIdx: index('payload_locked_documents_rels_parent_idx').on(columns.parent),
    pathIdx: index('payload_locked_documents_rels_path_idx').on(columns.path),
    payload_locked_documents_rels_users_id_idx: index(
      'payload_locked_documents_rels_users_id_idx',
    ).on(columns.usersID),
    payload_locked_documents_rels_media_id_idx: index(
      'payload_locked_documents_rels_media_id_idx',
    ).on(columns.mediaID),
    payload_locked_documents_rels_posts_id_idx: index(
      'payload_locked_documents_rels_posts_id_idx',
    ).on(columns.postsID),
    parentFk: foreignKey({
      columns: [columns['parent']],
      foreignColumns: [payload_locked_documents.id],
      name: 'payload_locked_documents_rels_parent_fk',
    }).onDelete('cascade'),
    usersIdFk: foreignKey({
      columns: [columns['usersID']],
      foreignColumns: [users.id],
      name: 'payload_locked_documents_rels_users_fk',
    }).onDelete('cascade'),
    mediaIdFk: foreignKey({
      columns: [columns['mediaID']],
      foreignColumns: [media.id],
      name: 'payload_locked_documents_rels_media_fk',
    }).onDelete('cascade'),
    postsIdFk: foreignKey({
      columns: [columns['postsID']],
      foreignColumns: [posts.id],
      name: 'payload_locked_documents_rels_posts_fk',
    }).onDelete('cascade'),
  }),
)

export const payload_preferences = pgTable(
  'payload_preferences',
  {
    id: serial('id').primaryKey(),
    key: varchar('key'),
    value: jsonb('value'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (columns) => ({
    payload_preferences_key_idx: index('payload_preferences_key_idx').on(columns.key),
    payload_preferences_updated_at_idx: index('payload_preferences_updated_at_idx').on(
      columns.updatedAt,
    ),
    payload_preferences_created_at_idx: index('payload_preferences_created_at_idx').on(
      columns.createdAt,
    ),
  }),
)

export const payload_preferences_rels = pgTable(
  'payload_preferences_rels',
  {
    id: serial('id').primaryKey(),
    order: integer('order'),
    parent: integer('parent_id').notNull(),
    path: varchar('path').notNull(),
    usersID: integer('users_id'),
  },
  (columns) => ({
    order: index('payload_preferences_rels_order_idx').on(columns.order),
    parentIdx: index('payload_preferences_rels_parent_idx').on(columns.parent),
    pathIdx: index('payload_preferences_rels_path_idx').on(columns.path),
    payload_preferences_rels_users_id_idx: index('payload_preferences_rels_users_id_idx').on(
      columns.usersID,
    ),
    parentFk: foreignKey({
      columns: [columns['parent']],
      foreignColumns: [payload_preferences.id],
      name: 'payload_preferences_rels_parent_fk',
    }).onDelete('cascade'),
    usersIdFk: foreignKey({
      columns: [columns['usersID']],
      foreignColumns: [users.id],
      name: 'payload_preferences_rels_users_fk',
    }).onDelete('cascade'),
  }),
)

export const payload_migrations = pgTable(
  'payload_migrations',
  {
    id: serial('id').primaryKey(),
    name: varchar('name'),
    batch: numeric('batch'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (columns) => ({
    payload_migrations_updated_at_idx: index('payload_migrations_updated_at_idx').on(
      columns.updatedAt,
    ),
    payload_migrations_created_at_idx: index('payload_migrations_created_at_idx').on(
      columns.createdAt,
    ),
  }),
)

export const home = pgTable('home', {
  id: serial('id').primaryKey(),
  header: varchar('header'),
  subhead: varchar('subhead'),
  intro: varchar('intro'),
  button: varchar('button'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
})

export const info_links = pgTable(
  'info_links',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    link_title: varchar('link_title').notNull(),
    link_url: varchar('link_url').notNull(),
  },
  (columns) => ({
    _orderIdx: index('info_links_order_idx').on(columns._order),
    _parentIDIdx: index('info_links_parent_id_idx').on(columns._parentID),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [info.id],
      name: 'info_links_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const info_strengths = pgTable(
  'info_strengths',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    title: varchar('title').notNull(),
    strengthsList: varchar('strengths_list').notNull(),
  },
  (columns) => ({
    _orderIdx: index('info_strengths_order_idx').on(columns._order),
    _parentIDIdx: index('info_strengths_parent_id_idx').on(columns._parentID),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [info.id],
      name: 'info_strengths_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const info = pgTable(
  'info',
  {
    id: serial('id').primaryKey(),
    header: varchar('header'),
    profileImage: integer('profile_image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    resume: integer('resume_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content'),
    content_html: varchar('content_html'),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
  },
  (columns) => ({
    info_profile_image_idx: index('info_profile_image_idx').on(columns.profileImage),
    info_resume_idx: index('info_resume_idx').on(columns.resume),
  }),
)

export const dev_past_projects = pgTable(
  'dev_past_projects',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    title: varchar('title').notNull(),
    image: integer('image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    link_url: varchar('link_url').notNull(),
    description: varchar('description'),
  },
  (columns) => ({
    _orderIdx: index('dev_past_projects_order_idx').on(columns._order),
    _parentIDIdx: index('dev_past_projects_parent_id_idx').on(columns._parentID),
    dev_past_projects_image_idx: index('dev_past_projects_image_idx').on(columns.image),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [dev.id],
      name: 'dev_past_projects_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const dev = pgTable('dev', {
  id: serial('id').primaryKey(),
  header: varchar('header'),
  content: jsonb('content'),
  content_html: varchar('content_html'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
})

export const art_artworks = pgTable(
  'art_artworks',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    title: varchar('title').notNull(),
    image: integer('image_id')
      .notNull()
      .references(() => media.id, {
        onDelete: 'set null',
      }),
    description: varchar('description'),
  },
  (columns) => ({
    _orderIdx: index('art_artworks_order_idx').on(columns._order),
    _parentIDIdx: index('art_artworks_parent_id_idx').on(columns._parentID),
    art_artworks_image_idx: index('art_artworks_image_idx').on(columns.image),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [art.id],
      name: 'art_artworks_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const art = pgTable('art', {
  id: serial('id').primaryKey(),
  header: varchar('header'),
  content: jsonb('content'),
  content_html: varchar('content_html'),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
})

export const footer_links = pgTable(
  'footer_links',
  {
    _order: integer('_order').notNull(),
    _parentID: integer('_parent_id').notNull(),
    id: varchar('id').primaryKey(),
    title: varchar('title'),
    link: varchar('link'),
  },
  (columns) => ({
    _orderIdx: index('footer_links_order_idx').on(columns._order),
    _parentIDIdx: index('footer_links_parent_id_idx').on(columns._parentID),
    _parentIDFk: foreignKey({
      columns: [columns['_parentID']],
      foreignColumns: [footer.id],
      name: 'footer_links_parent_id_fk',
    }).onDelete('cascade'),
  }),
)

export const footer = pgTable('footer', {
  id: serial('id').primaryKey(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true, precision: 3 }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 }),
})

export const relations_users_sessions = relations(users_sessions, ({ one }) => ({
  _parentID: one(users, {
    fields: [users_sessions._parentID],
    references: [users.id],
    relationName: 'sessions',
  }),
}))
export const relations_users = relations(users, ({ many }) => ({
  sessions: many(users_sessions, {
    relationName: 'sessions',
  }),
}))
export const relations_media = relations(media, () => ({}))
export const relations_posts = relations(posts, ({ one }) => ({
  featuredImage: one(media, {
    fields: [posts.featuredImage],
    references: [media.id],
    relationName: 'featuredImage',
  }),
}))
export const relations__posts_v = relations(_posts_v, ({ one }) => ({
  parent: one(posts, {
    fields: [_posts_v.parent],
    references: [posts.id],
    relationName: 'parent',
  }),
  version_featuredImage: one(media, {
    fields: [_posts_v.version_featuredImage],
    references: [media.id],
    relationName: 'version_featuredImage',
  }),
}))
export const relations_payload_locked_documents_rels = relations(
  payload_locked_documents_rels,
  ({ one }) => ({
    parent: one(payload_locked_documents, {
      fields: [payload_locked_documents_rels.parent],
      references: [payload_locked_documents.id],
      relationName: '_rels',
    }),
    usersID: one(users, {
      fields: [payload_locked_documents_rels.usersID],
      references: [users.id],
      relationName: 'users',
    }),
    mediaID: one(media, {
      fields: [payload_locked_documents_rels.mediaID],
      references: [media.id],
      relationName: 'media',
    }),
    postsID: one(posts, {
      fields: [payload_locked_documents_rels.postsID],
      references: [posts.id],
      relationName: 'posts',
    }),
  }),
)
export const relations_payload_locked_documents = relations(
  payload_locked_documents,
  ({ many }) => ({
    _rels: many(payload_locked_documents_rels, {
      relationName: '_rels',
    }),
  }),
)
export const relations_payload_preferences_rels = relations(
  payload_preferences_rels,
  ({ one }) => ({
    parent: one(payload_preferences, {
      fields: [payload_preferences_rels.parent],
      references: [payload_preferences.id],
      relationName: '_rels',
    }),
    usersID: one(users, {
      fields: [payload_preferences_rels.usersID],
      references: [users.id],
      relationName: 'users',
    }),
  }),
)
export const relations_payload_preferences = relations(payload_preferences, ({ many }) => ({
  _rels: many(payload_preferences_rels, {
    relationName: '_rels',
  }),
}))
export const relations_payload_migrations = relations(payload_migrations, () => ({}))
export const relations_home = relations(home, () => ({}))
export const relations_info_links = relations(info_links, ({ one }) => ({
  _parentID: one(info, {
    fields: [info_links._parentID],
    references: [info.id],
    relationName: 'links',
  }),
}))
export const relations_info_strengths = relations(info_strengths, ({ one }) => ({
  _parentID: one(info, {
    fields: [info_strengths._parentID],
    references: [info.id],
    relationName: 'strengths',
  }),
}))
export const relations_info = relations(info, ({ one, many }) => ({
  profileImage: one(media, {
    fields: [info.profileImage],
    references: [media.id],
    relationName: 'profileImage',
  }),
  resume: one(media, {
    fields: [info.resume],
    references: [media.id],
    relationName: 'resume',
  }),
  links: many(info_links, {
    relationName: 'links',
  }),
  strengths: many(info_strengths, {
    relationName: 'strengths',
  }),
}))
export const relations_dev_past_projects = relations(dev_past_projects, ({ one }) => ({
  _parentID: one(dev, {
    fields: [dev_past_projects._parentID],
    references: [dev.id],
    relationName: 'pastProjects',
  }),
  image: one(media, {
    fields: [dev_past_projects.image],
    references: [media.id],
    relationName: 'image',
  }),
}))
export const relations_dev = relations(dev, ({ many }) => ({
  pastProjects: many(dev_past_projects, {
    relationName: 'pastProjects',
  }),
}))
export const relations_art_artworks = relations(art_artworks, ({ one }) => ({
  _parentID: one(art, {
    fields: [art_artworks._parentID],
    references: [art.id],
    relationName: 'artworks',
  }),
  image: one(media, {
    fields: [art_artworks.image],
    references: [media.id],
    relationName: 'image',
  }),
}))
export const relations_art = relations(art, ({ many }) => ({
  artworks: many(art_artworks, {
    relationName: 'artworks',
  }),
}))
export const relations_footer_links = relations(footer_links, ({ one }) => ({
  _parentID: one(footer, {
    fields: [footer_links._parentID],
    references: [footer.id],
    relationName: 'links',
  }),
}))
export const relations_footer = relations(footer, ({ many }) => ({
  links: many(footer_links, {
    relationName: 'links',
  }),
}))

type DatabaseSchema = {
  enum_users_role: typeof enum_users_role
  enum_posts_status: typeof enum_posts_status
  enum__posts_v_version_status: typeof enum__posts_v_version_status
  users_sessions: typeof users_sessions
  users: typeof users
  media: typeof media
  posts: typeof posts
  _posts_v: typeof _posts_v
  payload_locked_documents: typeof payload_locked_documents
  payload_locked_documents_rels: typeof payload_locked_documents_rels
  payload_preferences: typeof payload_preferences
  payload_preferences_rels: typeof payload_preferences_rels
  payload_migrations: typeof payload_migrations
  home: typeof home
  info_links: typeof info_links
  info_strengths: typeof info_strengths
  info: typeof info
  dev_past_projects: typeof dev_past_projects
  dev: typeof dev
  art_artworks: typeof art_artworks
  art: typeof art
  footer_links: typeof footer_links
  footer: typeof footer
  relations_users_sessions: typeof relations_users_sessions
  relations_users: typeof relations_users
  relations_media: typeof relations_media
  relations_posts: typeof relations_posts
  relations__posts_v: typeof relations__posts_v
  relations_payload_locked_documents_rels: typeof relations_payload_locked_documents_rels
  relations_payload_locked_documents: typeof relations_payload_locked_documents
  relations_payload_preferences_rels: typeof relations_payload_preferences_rels
  relations_payload_preferences: typeof relations_payload_preferences
  relations_payload_migrations: typeof relations_payload_migrations
  relations_home: typeof relations_home
  relations_info_links: typeof relations_info_links
  relations_info_strengths: typeof relations_info_strengths
  relations_info: typeof relations_info
  relations_dev_past_projects: typeof relations_dev_past_projects
  relations_dev: typeof relations_dev
  relations_art_artworks: typeof relations_art_artworks
  relations_art: typeof relations_art
  relations_footer_links: typeof relations_footer_links
  relations_footer: typeof relations_footer
}

declare module '@payloadcms/db-postgres' {
  export interface GeneratedDatabaseSchema {
    schema: DatabaseSchema
  }
}
