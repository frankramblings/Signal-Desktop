// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Overlay domain types — purely local metadata, no Signal protocol data.

export type ThreadOverlayType = Readonly<{
  thread_ref: string;
  conversation_ref: string;
  title: string | null;
  color: string | null;
  is_pinned: boolean;
  updated_at: number;
  version: number;
}>;

export type MessageOverlayType = Readonly<{
  id: string;
  message_ref: string;
  conversation_ref: string;
  thread_ref: string | null;
  labels: ReadonlyArray<string>;
  note: string | null;
  updated_at: number;
  version: number;
}>;

// Raw DB row shape — labels stored as JSON string, booleans as integers.
export type MessageOverlayRow = Readonly<{
  id: string;
  message_ref: string;
  conversation_ref: string;
  thread_ref: string | null;
  labels_json: string;
  note: string | null;
  updated_at: number;
  version: number;
}>;

export type ThreadOverlayRow = Readonly<{
  thread_ref: string;
  conversation_ref: string;
  title: string | null;
  color: string | null;
  is_pinned: number; // 0 | 1
  updated_at: number;
  version: number;
}>;

// Input types for create/update operations (omit auto-managed fields).
export type CreateThreadOverlayInput = {
  thread_ref: string;
  conversation_ref: string;
  title?: string | null;
  color?: string | null;
  is_pinned?: boolean;
};

export type UpdateThreadOverlayInput = Partial<
  Pick<ThreadOverlayType, 'title' | 'color' | 'is_pinned'>
>;

export type CreateMessageOverlayInput = {
  id: string;
  message_ref: string;
  conversation_ref: string;
  thread_ref?: string | null;
  labels?: ReadonlyArray<string>;
  note?: string | null;
};

export type UpdateMessageOverlayInput = Partial<
  Pick<MessageOverlayType, 'thread_ref' | 'labels' | 'note'>
>;
