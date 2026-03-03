// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayContext: React Context providing overlay state for a conversation.
// Isolated from Signal's Redux store. Manages its own data lifecycle:
// loads on conversation change, updates on CRUD operations.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { ThreadOverlayType, MessageOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import { isOverlayThreadsEnabled } from '../OverlayFeatureFlag.std.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';

// ─── State ────────────────────────────────────────────────────────────────

export type OverlayState = {
  enabled: boolean;
  conversationId: string | null;
  threads: ReadonlyArray<ThreadOverlayType>;
  messageOverlays: ReadonlyArray<MessageOverlayType>;
  activeThreadRef: string | null;
  threadFilterActive: boolean;
  loading: boolean;
};

const initialState: OverlayState = {
  enabled: false,
  conversationId: null,
  threads: [],
  messageOverlays: [],
  activeThreadRef: null,
  threadFilterActive: false,
  loading: false,
};

// ─── Actions ──────────────────────────────────────────────────────────────

type OverlayAction =
  | { type: 'SET_CONVERSATION'; conversationId: string | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | {
      type: 'LOAD_DATA';
      threads: ReadonlyArray<ThreadOverlayType>;
      messageOverlays: ReadonlyArray<MessageOverlayType>;
    }
  | { type: 'ADD_THREAD'; thread: ThreadOverlayType }
  | { type: 'UPDATE_THREAD'; threadRef: string; updates: Partial<ThreadOverlayType> }
  | { type: 'REMOVE_THREAD'; threadRef: string }
  | { type: 'SET_ACTIVE_THREAD'; threadRef: string | null }
  | { type: 'TOGGLE_THREAD_FILTER' }
  | { type: 'ADD_MESSAGE_OVERLAY'; overlay: MessageOverlayType }
  | { type: 'UPDATE_MESSAGE_OVERLAY'; messageRef: string; overlay: MessageOverlayType }
  | { type: 'REFRESH_DATA'; threads: ReadonlyArray<ThreadOverlayType>; messageOverlays: ReadonlyArray<MessageOverlayType> };

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case 'SET_CONVERSATION':
      return {
        ...initialState,
        enabled: isOverlayThreadsEnabled(),
        conversationId: action.conversationId,
        loading: action.conversationId != null,
      };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'LOAD_DATA':
      return {
        ...state,
        threads: action.threads,
        messageOverlays: action.messageOverlays,
        loading: false,
      };
    case 'ADD_THREAD':
      return {
        ...state,
        threads: [...state.threads, action.thread],
      };
    case 'UPDATE_THREAD':
      return {
        ...state,
        threads: state.threads.map(t =>
          t.thread_ref === action.threadRef
            ? { ...t, ...action.updates }
            : t
        ),
      };
    case 'REMOVE_THREAD':
      return {
        ...state,
        threads: state.threads.filter(t => t.thread_ref !== action.threadRef),
        activeThreadRef:
          state.activeThreadRef === action.threadRef
            ? null
            : state.activeThreadRef,
      };
    case 'SET_ACTIVE_THREAD':
      return { ...state, activeThreadRef: action.threadRef };
    case 'TOGGLE_THREAD_FILTER':
      return { ...state, threadFilterActive: !state.threadFilterActive };
    case 'ADD_MESSAGE_OVERLAY':
      return {
        ...state,
        messageOverlays: [...state.messageOverlays, action.overlay],
      };
    case 'UPDATE_MESSAGE_OVERLAY':
      return {
        ...state,
        messageOverlays: state.messageOverlays.map(m =>
          m.message_ref === action.messageRef ? action.overlay : m
        ),
      };
    case 'REFRESH_DATA':
      return {
        ...state,
        threads: action.threads,
        messageOverlays: action.messageOverlays,
      };
    default:
      return state;
  }
}

// ─── Context value ────────────────────────────────────────────────────────

export type OverlayActions = {
  createThread: (title: string, messageRefInput?: MessageRefInput) => Promise<ThreadOverlayType | null>;
  deleteThread: (threadRef: string) => Promise<void>;
  renameThread: (threadRef: string, title: string) => Promise<void>;
  togglePinThread: (threadRef: string) => Promise<void>;
  assignMessageToThread: (messageRefInput: MessageRefInput, threadRef: string) => Promise<void>;
  removeMessageFromThread: (messageRefInput: MessageRefInput) => Promise<void>;
  addLabel: (messageRefInput: MessageRefInput, label: string) => Promise<void>;
  removeLabel: (messageRefInput: MessageRefInput, label: string) => Promise<void>;
  setNote: (messageRefInput: MessageRefInput, note: string | null) => Promise<void>;
  setActiveThread: (threadRef: string | null) => void;
  toggleThreadFilter: () => void;
  refreshData: () => Promise<void>;
};

type OverlayContextValue = {
  state: OverlayState;
  actions: OverlayActions;
};

const OverlayCtx = createContext<OverlayContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────

export function OverlayProvider({
  conversationId,
  children,
}: {
  conversationId: string | null;
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, dispatch] = useReducer(overlayReducer, initialState);

  // Reset state when conversation changes.
  useEffect(() => {
    dispatch({ type: 'SET_CONVERSATION', conversationId });
  }, [conversationId]);

  // Load overlay data when conversation is set.
  const loadData = useCallback(async () => {
    if (!conversationId || !isOverlayThreadsEnabled()) {
      return;
    }
    try {
      const [threads, messageOverlays] = await Promise.all([
        OverlayService.getThreadsForConversation(conversationId),
        OverlayService.getMessageOverlaysForConversation(conversationId),
      ]);
      dispatch({ type: 'LOAD_DATA', threads, messageOverlays });
    } catch (err) {
      // Fail-open: overlay failure must not break Signal.
      // eslint-disable-next-line no-console
      console.error('Overlay: failed to load data', err);
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [conversationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Helper to refresh after mutations.
  const refreshData = useCallback(async () => {
    if (!conversationId || !isOverlayThreadsEnabled()) {
      return;
    }
    const [threads, messageOverlays] = await Promise.all([
      OverlayService.getThreadsForConversation(conversationId),
      OverlayService.getMessageOverlaysForConversation(conversationId),
    ]);
    dispatch({ type: 'REFRESH_DATA', threads, messageOverlays });
  }, [conversationId]);

  const actions: OverlayActions = useMemo(() => ({
    createThread: async (title, messageRefInput) => {
      if (!conversationId) return null;
      const thread = await OverlayService.createThread({
        conversationId,
        title,
        messageRefInput,
      });
      if (thread) {
        await refreshData();
      }
      return thread;
    },
    deleteThread: async (threadRef) => {
      await OverlayService.deleteThread(threadRef);
      dispatch({ type: 'REMOVE_THREAD', threadRef });
    },
    renameThread: async (threadRef, title) => {
      await OverlayService.updateThread(threadRef, { title });
      dispatch({
        type: 'UPDATE_THREAD',
        threadRef,
        updates: { title, updated_at: Date.now() },
      });
    },
    togglePinThread: async (threadRef) => {
      const thread = state.threads.find(t => t.thread_ref === threadRef);
      if (!thread) return;
      await OverlayService.togglePinThread(threadRef);
      dispatch({
        type: 'UPDATE_THREAD',
        threadRef,
        updates: { is_pinned: !thread.is_pinned, updated_at: Date.now() },
      });
    },
    assignMessageToThread: async (messageRefInput, threadRef) => {
      if (!conversationId) return;
      await OverlayService.assignMessageToThread({
        conversationId,
        messageRefInput,
        threadRef,
      });
      await refreshData();
    },
    removeMessageFromThread: async (messageRefInput) => {
      await OverlayService.removeMessageFromThread(messageRefInput);
      await refreshData();
    },
    addLabel: async (messageRefInput, label) => {
      if (!conversationId) return;
      await OverlayService.addLabel(messageRefInput, conversationId, label);
      await refreshData();
    },
    removeLabel: async (messageRefInput, label) => {
      await OverlayService.removeLabel(messageRefInput, label);
      await refreshData();
    },
    setNote: async (messageRefInput, note) => {
      if (!conversationId) return;
      await OverlayService.setNote(messageRefInput, conversationId, note);
      await refreshData();
    },
    setActiveThread: (threadRef) => {
      dispatch({ type: 'SET_ACTIVE_THREAD', threadRef });
    },
    toggleThreadFilter: () => {
      dispatch({ type: 'TOGGLE_THREAD_FILTER' });
    },
    refreshData,
  }), [conversationId, state.threads, refreshData]);

  const value = useMemo(
    () => ({ state, actions }),
    [state, actions]
  );

  return (
    <OverlayCtx.Provider value={value}>
      {children}
    </OverlayCtx.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayCtx);
  if (!ctx) {
    throw new Error('useOverlay must be used within OverlayProvider');
  }
  return ctx;
}

export function useOverlayState(): OverlayState {
  return useOverlay().state;
}

export function useOverlayActions(): OverlayActions {
  return useOverlay().actions;
}

export function useThreadsForConversation(): ReadonlyArray<ThreadOverlayType> {
  return useOverlayState().threads;
}

export function useMessageOverlayByRef(
  messageRef: string | null
): MessageOverlayType | undefined {
  const { messageOverlays } = useOverlayState();
  return useMemo(
    () =>
      messageRef
        ? messageOverlays.find(m => m.message_ref === messageRef)
        : undefined,
    [messageOverlays, messageRef]
  );
}
