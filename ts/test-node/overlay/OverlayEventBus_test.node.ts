// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import {
  overlayEvents,
  OverlayEventType,
} from '../../overlay/services/OverlayEventBus.dom.js';

describe('overlay/OverlayEventBus', () => {
  it('fires threads-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
  });

  it('fires messages-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    overlayEvents.emit(OverlayEventType.MessagesChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.MessagesChanged, handler);
  });

  it('fires labels-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.LabelsChanged, handler);
    overlayEvents.emit(OverlayEventType.LabelsChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.LabelsChanged, handler);
  });

  it('does not fire for unsubscribed events', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.emit(OverlayEventType.MessagesChanged);
    assert.isFalse(called);
    overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
  });

  it('supports multiple listeners', () => {
    let count = 0;
    const h1 = () => { count += 1; };
    const h2 = () => { count += 10; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.on(OverlayEventType.ThreadsChanged, h2);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.equal(count, 11);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h2);
  });

  it('off removes only the specified listener', () => {
    let count = 0;
    const h1 = () => { count += 1; };
    const h2 = () => { count += 10; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.on(OverlayEventType.ThreadsChanged, h2);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.equal(count, 10);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h2);
  });
});
