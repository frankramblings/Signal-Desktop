# M2 UX Hardening Design

**Date:** 2026-03-02
**Approach:** Minimal Overlay-Only (no new Signal core integration points)

## 1. Thread Filter

- ThreadChipRow click sets `activeFilterThreadRef` in ConversationView local state
- "All" chip as first item clears filter
- ConversationView passes filter down; timeline hides non-matching messages
- Filter resets on conversation switch

## 2. Empty/Error States

- ThreadOverlayPanel: inline empty-state with guidance text
- OverlayErrorBanner: non-blocking, auto-dismiss 8s, closeable
- All OverlayService calls wrapped in try/catch at UI layer

## 3. Soft Undo

- OverlayUndoManager: session-scoped in-memory stack (max 20)
- Records inverse operations for delete thread, remove message, remove label
- OverlayUndoToast: 5s toast with Undo button
- On undo: execute inverse, emit refresh event

## 4. Accessibility + i18n

- ~25 `icu:Overlay--*` keys in messages.json
- Replace all hardcoded English strings
- ARIA roles: toolbar, button, dialog, alert
- Keyboard: Enter/Space for chips, Escape for dialogs, Tab order

## 5. Event-Driven Refresh

- OverlayEventBus: singleton EventTarget
- Events: threads-changed, messages-changed, labels-changed
- OverlayService emits after mutations
- Components subscribe via useEffect; remove 3s polling

## New Files

- ts/overlay/services/OverlayEventBus.dom.ts
- ts/overlay/services/OverlayUndoManager.dom.ts
- ts/overlay/ui/OverlayErrorBanner.dom.tsx
- ts/overlay/ui/OverlayUndoToast.dom.tsx
- ts/test-node/overlay/OverlayEventBus_test.node.ts
- ts/test-node/overlay/OverlayUndoManager_test.node.ts

## Modified Files

- ts/overlay/services/OverlayService.dom.ts
- ts/overlay/ui/ThreadChipRow.dom.tsx
- ts/overlay/ui/ThreadOverlayPanel.dom.tsx
- ts/overlay/ui/ThreadCreateDialog.dom.tsx
- ts/overlay/ui/LabelEditor.dom.tsx
- ts/overlay/ui/OverlayMenuActions.dom.tsx
- ts/overlay/ui/styles/overlay.scss
- ts/overlay/index.std.ts
- ts/components/conversation/ConversationView.dom.tsx
- _locales/en/messages.json
