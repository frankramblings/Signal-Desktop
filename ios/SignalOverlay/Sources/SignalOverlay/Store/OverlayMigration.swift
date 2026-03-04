// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import GRDB

public struct OverlayMigration {
    public static func registerMigrations(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("overlay-v1") { db in
            try db.create(table: "thread_overlay") { t in
                t.column("thread_ref", .text).notNull().primaryKey()
                t.column("conversation_ref", .text).notNull()
                t.column("title", .text)
                t.column("color", .text)
                t.column("is_pinned", .integer).notNull().defaults(to: 0)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            try db.create(table: "message_overlay") { t in
                t.column("id", .text).notNull().primaryKey()
                t.column("message_ref", .text).notNull().unique()
                t.column("conversation_ref", .text).notNull()
                t.column("thread_ref", .text)
                t.column("labels_json", .text).notNull().defaults(to: "[]")
                t.column("note", .text)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            try db.create(table: "overlay_sync_state") { t in
                t.column("device_id", .text).notNull().primaryKey()
                t.column("last_sync_token", .text)
                t.column("last_sync_at", .integer)
            }

            try db.create(index: "idx_message_overlay_conversation_ref", on: "message_overlay", columns: ["conversation_ref"])
            try db.create(index: "idx_message_overlay_thread_ref", on: "message_overlay", columns: ["thread_ref"])
            try db.create(index: "idx_thread_overlay_conversation_ref", on: "thread_overlay", columns: ["conversation_ref"])
            try db.create(index: "idx_thread_overlay_updated_at", on: "thread_overlay", columns: ["updated_at"])
        }
    }
}
