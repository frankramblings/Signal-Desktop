// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// CloudKitHttpClient: HTTP implementation of CloudKitAdapter.
// Uses Apple's CloudKit Web Services REST API to sync overlay metadata.
// Runs in the main Node process only.

import type { CloudKitAdapter } from './CloudKitAdapter.std.js';
import type {
  SyncRecord,
  FetchChangesResult,
  PushResult,
  CloudKitConfig,
  ThreadSyncRecord,
  MessageSyncRecord,
} from './OverlaySyncTypes.std.js';
import * as log from '../../logging/log.js';

const ZONE_NAME = 'OverlayZone';
const CLOUDKIT_BASE = 'https://api.apple-cloudkit.com';

type CloudKitRecordField = {
  value: string | number | boolean | null;
  type?: string;
};

type CloudKitRecord = {
  recordName: string;
  recordType: string;
  fields: Record<string, CloudKitRecordField>;
  recordChangeTag?: string;
  deleted?: boolean;
};

type CloudKitZoneChangesResponse = {
  records: ReadonlyArray<CloudKitRecord>;
  moreComing: boolean;
  syncToken: string;
};

export class CloudKitHttpClient implements CloudKitAdapter {
  private config: CloudKitConfig | null = null;
  private ready = false;

  async initialize(config: CloudKitConfig): Promise<void> {
    this.config = config;
    await this.ensureZoneExists();
    this.ready = true;
    log.info('CloudKitHttpClient: initialized successfully');
  }

  isReady(): boolean {
    return this.ready;
  }

  async fetchChanges(
    syncToken: string | null
  ): Promise<FetchChangesResult> {
    this.assertReady();

    const url = this.buildUrl('/records/changes');
    const body: Record<string, unknown> = {
      zoneID: { zoneName: ZONE_NAME },
      resultsLimit: 200,
    };
    if (syncToken) {
      body.syncToken = syncToken;
    }

    const response = await this.request('POST', url, body);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `CloudKit fetchChanges failed: ${response.status} ${text}`
      );
    }

    const data = (await response.json()) as CloudKitZoneChangesResponse;

    const records: Array<SyncRecord> = [];
    for (const ckRecord of data.records) {
      const parsed = this.parseCloudKitRecord(ckRecord);
      if (parsed) {
        records.push(parsed);
      }
    }

    return {
      records,
      newSyncToken: data.syncToken,
      hasMore: data.moreComing,
    };
  }

  async pushRecords(
    records: ReadonlyArray<SyncRecord>
  ): Promise<PushResult> {
    this.assertReady();

    const url = this.buildUrl('/records/modify');
    const operations = records.map(record => ({
      operationType: record._deleted ? 'delete' : 'forceReplace',
      record: this.toCloudKitRecord(record),
      desiredKeys: undefined,
    }));

    const body = {
      zoneID: { zoneName: ZONE_NAME },
      operations,
      atomic: false, // Allow partial success
    };

    const response = await this.request('POST', url, body);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `CloudKit pushRecords failed: ${response.status} ${text}`
      );
    }

    const data = (await response.json()) as {
      records: ReadonlyArray<
        CloudKitRecord & { serverErrorCode?: string }
      >;
    };

    const savedRecords: Array<SyncRecord> = [];
    const failedRecords: Array<{ record: SyncRecord; reason: string }> = [];

    for (let i = 0; i < data.records.length; i++) {
      const ckResult = data.records[i];
      if (ckResult.serverErrorCode) {
        failedRecords.push({
          record: records[i],
          reason: ckResult.serverErrorCode,
        });
      } else {
        savedRecords.push(records[i]);
      }
    }

    return { savedRecords, failedRecords };
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private assertReady(): void {
    if (!this.config || !this.ready) {
      throw new Error('CloudKitHttpClient not initialized');
    }
  }

  private async ensureZoneExists(): Promise<void> {
    const url = this.buildUrl('/zones/modify');
    const body = {
      operations: [
        {
          operationType: 'create',
          zone: { zoneID: { zoneName: ZONE_NAME } },
        },
      ],
    };

    const response = await this.request('POST', url, body);

    // Zone already exists is fine (409 or success)
    if (!response.ok && response.status !== 409) {
      const text = await response.text();
      // Check for ZONE_ALREADY_EXISTS in the response body
      if (!text.includes('ZONE_ALREADY_EXISTS')) {
        throw new Error(
          `CloudKit ensureZoneExists failed: ${response.status} ${text}`
        );
      }
    }
  }

  private buildUrl(path: string): string {
    const cfg = this.config!;
    const env = cfg.environment === 'production' ? 'production' : 'development';
    return `${CLOUDKIT_BASE}/database/1/${cfg.containerIdentifier}/${env}/private${path}`;
  }

  private async request(
    method: string,
    url: string,
    body: unknown
  ): Promise<Response> {
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config!.apiToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  private toCloudKitRecord(record: SyncRecord): CloudKitRecord {
    if (record._type === 'thread_overlay') {
      return {
        recordName: `thread:${record.thread_ref}`,
        recordType: 'ThreadOverlay',
        fields: {
          thread_ref: { value: record.thread_ref },
          conversation_ref: { value: record.conversation_ref },
          title: { value: record.title },
          color: { value: record.color },
          is_pinned: { value: record.is_pinned ? 1 : 0 },
          updated_at: { value: record.updated_at },
          version: { value: record.version },
        },
      };
    }

    return {
      recordName: `message:${record.id}`,
      recordType: 'MessageOverlay',
      fields: {
        id: { value: record.id },
        message_ref: { value: record.message_ref },
        conversation_ref: { value: record.conversation_ref },
        thread_ref: { value: record.thread_ref },
        labels_json: { value: JSON.stringify(record.labels) },
        note: { value: record.note },
        updated_at: { value: record.updated_at },
        version: { value: record.version },
      },
    };
  }

  private parseCloudKitRecord(ck: CloudKitRecord): SyncRecord | null {
    if (ck.deleted) {
      // Deleted records — derive type from recordName prefix
      if (ck.recordName.startsWith('thread:')) {
        const threadRef = ck.recordName.slice('thread:'.length);
        return {
          _type: 'thread_overlay',
          _deleted: true,
          thread_ref: threadRef,
          conversation_ref: '',
          title: null,
          color: null,
          is_pinned: false,
          updated_at: 0,
          version: 0,
        };
      }
      if (ck.recordName.startsWith('message:')) {
        const id = ck.recordName.slice('message:'.length);
        return {
          _type: 'message_overlay',
          _deleted: true,
          id,
          message_ref: '',
          conversation_ref: '',
          thread_ref: null,
          labels: [],
          note: null,
          updated_at: 0,
          version: 0,
        };
      }
      return null;
    }

    const f = ck.fields;
    if (ck.recordType === 'ThreadOverlay') {
      return {
        _type: 'thread_overlay',
        thread_ref: String(f.thread_ref?.value ?? ''),
        conversation_ref: String(f.conversation_ref?.value ?? ''),
        title: f.title?.value != null ? String(f.title.value) : null,
        color: f.color?.value != null ? String(f.color.value) : null,
        is_pinned: f.is_pinned?.value === 1 || f.is_pinned?.value === true,
        updated_at: Number(f.updated_at?.value ?? 0),
        version: Number(f.version?.value ?? 0),
      };
    }

    if (ck.recordType === 'MessageOverlay') {
      let labels: ReadonlyArray<string> = [];
      try {
        labels = JSON.parse(
          String(f.labels_json?.value ?? '[]')
        ) as ReadonlyArray<string>;
      } catch {
        labels = [];
      }
      return {
        _type: 'message_overlay',
        id: String(f.id?.value ?? ''),
        message_ref: String(f.message_ref?.value ?? ''),
        conversation_ref: String(f.conversation_ref?.value ?? ''),
        thread_ref:
          f.thread_ref?.value != null ? String(f.thread_ref.value) : null,
        labels,
        note: f.note?.value != null ? String(f.note.value) : null,
        updated_at: Number(f.updated_at?.value ?? 0),
        version: Number(f.version?.value ?? 0),
      };
    }

    log.warn(
      `CloudKitHttpClient: unknown record type ${ck.recordType}`
    );
    return null;
  }
}
