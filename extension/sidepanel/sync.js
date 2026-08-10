/**
 * CFSync — local-first cloud sync for the side panel.
 *
 * chrome.storage.local stays the source of truth for the UI; this module
 * mirrors it into per-user Supabase tables (boats, companies, trips,
 * travelers, captain_profiles) and a private storage bucket for passport
 * images. Everything keeps working signed-out or offline — sync is a
 * best-effort background mirror, never a gate.
 *
 * How changes are detected: app.js routes every save through setStorage(),
 * which calls stampChanges() before the write (stamps updatedAt on records
 * that actually changed) and onLocalWrite() after it (diffs against a
 * snapshot, enqueues upserts and tombstones). The queue lives in
 * chrome.storage.local (pendingSyncOps) so it survives panel restarts, and
 * flushes when signed in + online.
 *
 * Conflict rule: last-write-wins on the client-stamped updatedAt (ms epoch)
 * carried inside each record. The server's updated_at column is only used as
 * the delta-pull cursor. Deletes are tombstones (deleted = true) so they
 * propagate to other devices; a local edit newer than a tombstone wins and
 * resurrects the record.
 *
 * Boats get one extra rule: records whose normalized vesselName matches are
 * treated as the same logical boat even under different local ids, because
 * every fresh install seeds the same vessels with freshly generated ids. The
 * smaller local_id deterministically survives so all devices converge.
 */

const CFSync = (() => {
  const TABLE_KEYS = ['boats', 'companies', 'trips', 'travelers'];
  const EXPIRING_KEYS = ['trips', 'travelers'];
  const QUEUE_KEY = 'pendingSyncOps';
  const CURSOR_KEY = 'syncCursors';
  const MIGRATED_KEY = 'initialSyncDone';

  // key -> Map(localId -> serialized record sans updatedAt)
  const snapshot = {};
  let captainSnapshot = null;
  // travelerId -> data URL string (references, not copies)
  let imageSnapshot = {};

  let queue = [];
  let flushing = false;
  let flushTimer = null;
  let status = 'signedout'; // signedout | synced | pending | syncing | offline | error
  let lastError = null;
  let lastSyncAt = null;
  const statusListeners = [];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function serializeRecord(record) {
    const { updatedAt, ...rest } = record;
    return JSON.stringify(rest);
  }

  function isExpired(record) {
    return typeof record.expiresAt === 'number' && record.expiresAt < Date.now();
  }

  function normalizedBoatName(record) {
    return (record.vesselName || '').trim().toLowerCase();
  }

  function setStatus(next, err) {
    status = next;
    lastError = err || null;
    statusListeners.forEach((fn) => {
      try {
        fn(status, { error: lastError, pending: queue.length, lastSyncAt });
      } catch (e) {
        console.error('CFSync status listener error:', e);
      }
    });
  }

  async function rawGet(keys) {
    return chrome.storage.local.get(keys);
  }

  // Direct write — deliberately bypasses app.js setStorage() so pull merges
  // never re-enter the push pipeline.
  async function rawSet(data) {
    return chrome.storage.local.set(data);
  }

  async function persistQueue() {
    await rawSet({ [QUEUE_KEY]: queue });
  }

  function enqueue(op) {
    // One op per (table, localId): the latest state is all that matters.
    queue = queue.filter(
      (q) => !(q.table === op.table && q.localId === op.localId && q.type === op.type)
    );
    queue.push(op);
  }

  // ---------------------------------------------------------------------------
  // Snapshot management
  // ---------------------------------------------------------------------------

  function rebuildSnapshotFrom(data) {
    for (const key of TABLE_KEYS) {
      snapshot[key] = new Map();
      for (const record of data[key] || []) {
        if (record && record.id) snapshot[key].set(record.id, serializeRecord(record));
      }
    }
    captainSnapshot = data.captain ? serializeRecord(data.captain) : null;
    imageSnapshot = {};
    for (const [id, img] of Object.entries(data.travelerImages || {})) {
      if (img && img.data) imageSnapshot[id] = img.data;
    }
  }

  // ---------------------------------------------------------------------------
  // Change detection (called from app.js setStorage wrapper)
  // ---------------------------------------------------------------------------

  /**
   * Stamp updatedAt on records that differ from the snapshot. Runs BEFORE the
   * local write so the stamp is persisted with the record.
   */
  function stampChanges(data) {
    const now = Date.now();
    for (const key of TABLE_KEYS) {
      if (!Array.isArray(data[key])) continue;
      for (const record of data[key]) {
        if (!record || !record.id) continue;
        const prev = snapshot[key] ? snapshot[key].get(record.id) : undefined;
        if (prev !== serializeRecord(record) || !record.updatedAt) {
          record.updatedAt = now;
        }
      }
    }
    if (data.captain && serializeRecord(data.captain) !== captainSnapshot) {
      data.captain.updatedAt = now;
    }
  }

  /**
   * Diff the written data against the snapshot, enqueue ops, update the
   * snapshot, and schedule a flush. Runs AFTER a successful local write.
   */
  function onLocalWrite(data) {
    const now = Date.now();
    let changed = false;

    for (const key of TABLE_KEYS) {
      if (!Array.isArray(data[key])) continue;
      const prevMap = snapshot[key] || new Map();
      const nextMap = new Map();
      for (const record of data[key]) {
        if (!record || !record.id) continue;
        const serialized = serializeRecord(record);
        nextMap.set(record.id, serialized);
        if (prevMap.get(record.id) !== serialized) {
          enqueue({ type: 'upsert', table: key, localId: record.id, record, ts: now });
          changed = true;
        }
      }
      for (const id of prevMap.keys()) {
        if (!nextMap.has(id)) {
          enqueue({ type: 'delete', table: key, localId: id, ts: now });
          if (key === 'travelers') {
            enqueue({ type: 'imageDelete', table: 'images', localId: id, ts: now });
          }
          changed = true;
        }
      }
      snapshot[key] = nextMap;
    }

    if (data.captain) {
      const serialized = serializeRecord(data.captain);
      if (serialized !== captainSnapshot) {
        enqueue({ type: 'captain', table: 'captain_profiles', localId: 'captain', record: data.captain, ts: now });
        captainSnapshot = serialized;
        changed = true;
      }
    }

    if (data.travelerImages && typeof data.travelerImages === 'object') {
      const nextImages = {};
      for (const [id, img] of Object.entries(data.travelerImages)) {
        if (!img || !img.data) continue;
        nextImages[id] = img.data;
        if (imageSnapshot[id] !== img.data) {
          enqueue({ type: 'imageUpload', table: 'images', localId: id, ts: now });
          changed = true;
        }
      }
      for (const id of Object.keys(imageSnapshot)) {
        if (!nextImages[id]) {
          enqueue({ type: 'imageDelete', table: 'images', localId: id, ts: now });
          changed = true;
        }
      }
      imageSnapshot = nextImages;
    }

    if (changed) {
      persistQueue();
      setStatus(queue.length ? 'pending' : status);
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 2000);
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: mime }), mime };
  }

  function imageExtension(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'jpg';
  }

  async function flush() {
    if (flushing || !queue.length) return;
    const session = await CFAuth.getSession();
    if (!session) {
      setStatus('signedout');
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    flushing = true;
    setStatus('syncing');
    const client = CFAuth.client;
    const uid = session.user.id;

    try {
      // Group table ops into one upsert per table.
      const byTable = {};
      const imageOps = [];
      let captainOp = null;
      for (const op of queue) {
        if (op.type === 'upsert' || op.type === 'delete') {
          (byTable[op.table] = byTable[op.table] || []).push(op);
        } else if (op.type === 'captain') {
          captainOp = op;
        } else {
          imageOps.push(op);
        }
      }

      for (const [table, ops] of Object.entries(byTable)) {
        const rows = ops.map((op) =>
          op.type === 'delete'
            ? { local_id: op.localId, data: { updatedAt: op.ts }, deleted: true }
            : { local_id: op.localId, data: op.record, deleted: false }
        );
        const { error } = await client.from(table).upsert(rows, { onConflict: 'user_id,local_id' });
        if (error) throw error;
        queue = queue.filter((q) => !ops.includes(q));
        await persistQueue();
      }

      if (captainOp) {
        const { error } = await client
          .from('captain_profiles')
          .upsert({ data: captainOp.record }, { onConflict: 'user_id' });
        if (error) throw error;
        queue = queue.filter((q) => q !== captainOp);
        await persistQueue();
      }

      for (const op of imageOps) {
        if (op.type === 'imageUpload') {
          const stored = await rawGet(['travelerImages']);
          const img = (stored.travelerImages || {})[op.localId];
          if (img && img.data) {
            const { blob, mime } = dataUrlToBlob(img.data);
            const path = `${uid}/${op.localId}.${imageExtension(mime)}`;
            const { error } = await client.storage
              .from('traveler-images')
              .upload(path, blob, { upsert: true, contentType: mime });
            if (error) throw error;
          }
        } else {
          // Best-effort delete of any extension variant.
          const paths = ['jpg', 'png', 'webp'].map((ext) => `${uid}/${op.localId}.${ext}`);
          await client.storage.from('traveler-images').remove(paths);
        }
        queue = queue.filter((q) => q !== op);
        await persistQueue();
      }

      lastSyncAt = Date.now();
      await rawSet({ lastSyncAt });
      setStatus(queue.length ? 'pending' : 'synced');
    } catch (err) {
      console.error('CFSync flush failed:', err);
      setStatus('error', err.message || String(err));
    } finally {
      flushing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Pull
  // ---------------------------------------------------------------------------

  /**
   * Merge one table's remote rows into a local array. Returns { merged,
   * changed }. LWW on record.updatedAt; tombstones remove; a local record
   * newer than its tombstone is re-enqueued for push.
   */
  function mergeTable(key, localArray, remoteRows) {
    const byId = new Map();
    for (const record of localArray) {
      if (record && record.id) byId.set(record.id, record);
    }
    let changed = false;
    const now = Date.now();

    for (const row of remoteRows) {
      const remote = row.data || {};
      const remoteStamp = remote.updatedAt || 0;
      const local = byId.get(row.local_id);
      const localStamp = local ? local.updatedAt || 0 : 0;

      if (row.deleted) {
        if (local && localStamp <= remoteStamp) {
          byId.delete(row.local_id);
          changed = true;
        } else if (local) {
          enqueue({ type: 'upsert', table: key, localId: local.id, record: local, ts: now });
        }
        continue;
      }

      // Expired remote rows: don't import; tidy the cloud copy up too.
      if (EXPIRING_KEYS.includes(key) && isExpired(remote)) {
        enqueue({ type: 'delete', table: key, localId: row.local_id, ts: now });
        if (key === 'travelers') {
          enqueue({ type: 'imageDelete', table: 'images', localId: row.local_id, ts: now });
        }
        continue;
      }

      if (!local) {
        remote.id = row.local_id;
        byId.set(row.local_id, remote);
        changed = true;
      } else if (remoteStamp > localStamp) {
        remote.id = row.local_id;
        byId.set(row.local_id, remote);
        changed = true;
      }
    }

    let merged = Array.from(byId.values());

    // Seed-duplicate dedupe: same vessel name under two ids means every device
    // seeded it independently. Deterministically keep the smaller id.
    if (key === 'boats') {
      const byName = new Map();
      for (const boat of merged) {
        const name = normalizedBoatName(boat);
        if (!name) continue;
        const existing = byName.get(name);
        if (!existing) {
          byName.set(name, boat);
          continue;
        }
        const keep = existing.id < boat.id ? existing : boat;
        const drop = keep === existing ? boat : existing;
        // Newer content wins onto the surviving id.
        if ((drop.updatedAt || 0) > (keep.updatedAt || 0)) {
          const keepId = keep.id;
          Object.assign(keep, drop, { id: keepId });
        }
        byName.set(name, keep);
        enqueue({ type: 'delete', table: 'boats', localId: drop.id, ts: now });
        enqueue({ type: 'upsert', table: 'boats', localId: keep.id, record: keep, ts: now });
        merged = merged.filter((b) => b !== drop);
        changed = true;
      }
    }

    return { merged, changed };
  }

  async function pullAll() {
    const session = await CFAuth.getSession();
    if (!session || !navigator.onLine) return false;

    const client = CFAuth.client;
    const uid = session.user.id;
    setStatus('syncing');

    try {
      const stored = await rawGet([
        'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages', CURSOR_KEY,
      ]);
      const cursors = stored[CURSOR_KEY] || {};
      const writes = {};
      let anyChange = false;

      for (const key of TABLE_KEYS) {
        let query = client.from(key).select('local_id, data, deleted, updated_at');
        if (cursors[key]) query = query.gt('updated_at', cursors[key]);
        const { data: rows, error } = await query;
        if (error) throw error;
        if (!rows || !rows.length) continue;

        const { merged, changed } = mergeTable(key, stored[key] || [], rows);
        if (changed) {
          writes[key] = merged;
          anyChange = true;
        }
        cursors[key] = rows.reduce(
          (max, r) => (r.updated_at > max ? r.updated_at : max),
          cursors[key] || ''
        );
      }

      // Captain profile (single row, no tombstones).
      {
        let query = client.from('captain_profiles').select('data, updated_at');
        if (cursors.captain_profiles) query = query.gt('updated_at', cursors.captain_profiles);
        const { data: rows, error } = await query;
        if (error) throw error;
        if (rows && rows.length) {
          const remote = rows[0].data || {};
          const local = stored.captain;
          if (!local || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
            writes.captain = remote;
            anyChange = true;
          }
          cursors.captain_profiles = rows[0].updated_at;
        }
      }

      // Images: list the user's folder, download any the merged travelers are
      // missing locally.
      const travelers = writes.travelers || stored.travelers || [];
      const localImages = { ...(stored.travelerImages || {}) };
      if (travelers.length) {
        const { data: objects, error: listError } = await client.storage
          .from('traveler-images')
          .list(uid, { limit: 1000 });
        if (!listError && objects && objects.length) {
          let imagesChanged = false;
          for (const obj of objects) {
            const travelerId = obj.name.replace(/\.(jpg|png|webp)$/, '');
            const traveler = travelers.find((t) => t.id === travelerId);
            if (!traveler || isExpired(traveler) || localImages[travelerId]) continue;
            const { data: blob, error: dlError } = await client.storage
              .from('traveler-images')
              .download(`${uid}/${obj.name}`);
            if (dlError || !blob) continue;
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            localImages[travelerId] = { data: dataUrl, expiresAt: traveler.expiresAt };
            imagesChanged = true;
          }
          if (imagesChanged) {
            writes.travelerImages = localImages;
            anyChange = true;
          }
        }
      }

      writes[CURSOR_KEY] = cursors;
      await rawSet(writes);
      await persistQueue();

      if (anyChange) {
        // Refresh the snapshot from what we just wrote so the next local save
        // diffs against merged reality, then let app.js re-render.
        const fresh = await rawGet([
          'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages',
        ]);
        rebuildSnapshotFrom(fresh);
        if (typeof loadAllData === 'function' && typeof renderAll === 'function') {
          await loadAllData();
          renderAll();
        }
      }

      lastSyncAt = Date.now();
      await rawSet({ lastSyncAt });
      setStatus(queue.length ? 'pending' : 'synced');
      if (queue.length) scheduleFlush();
      return anyChange;
    } catch (err) {
      console.error('CFSync pull failed:', err);
      setStatus('error', err.message || String(err));
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // First-login migration
  // ---------------------------------------------------------------------------

  /**
   * Push everything local up once per account sign-in, so a user's existing
   * single-browser data becomes the seed of their cloud account.
   */
  async function initialMigration() {
    const stored = await rawGet([
      'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages', MIGRATED_KEY,
    ]);
    if (stored[MIGRATED_KEY]) return;

    const now = Date.now();
    const stampedWrites = {};
    for (const key of TABLE_KEYS) {
      const records = (stored[key] || []).filter((r) => r && r.id && !isExpired(r));
      for (const record of records) {
        if (!record.updatedAt) record.updatedAt = now;
        enqueue({ type: 'upsert', table: key, localId: record.id, record, ts: now });
      }
      if (records.length) stampedWrites[key] = stored[key];
    }
    if (stored.captain) {
      if (!stored.captain.updatedAt) stored.captain.updatedAt = now;
      enqueue({ type: 'captain', table: 'captain_profiles', localId: 'captain', record: stored.captain, ts: now });
      stampedWrites.captain = stored.captain;
    }
    for (const id of Object.keys(stored.travelerImages || {})) {
      enqueue({ type: 'imageUpload', table: 'images', localId: id, ts: now });
    }

    stampedWrites[MIGRATED_KEY] = true;
    await rawSet(stampedWrites);
    await persistQueue();
    await flush();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async function init() {
    const stored = await rawGet([
      'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages',
      QUEUE_KEY, 'lastSyncAt',
    ]);
    queue = stored[QUEUE_KEY] || [];
    lastSyncAt = stored.lastSyncAt || null;
    rebuildSnapshotFrom(stored);

    CFAuth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        initialMigration().then(() => pullAll());
      } else if (event === 'SIGNED_OUT') {
        rawSet({ [MIGRATED_KEY]: false, [CURSOR_KEY]: {} });
        setStatus('signedout');
      }
    });

    window.addEventListener('online', () => {
      if (queue.length) flush();
    });

    const session = await CFAuth.getSession();
    if (session) {
      setStatus(queue.length ? 'pending' : 'synced');
      if (queue.length) scheduleFlush();
    } else {
      setStatus('signedout');
    }
  }

  async function syncNow() {
    await flush();
    await pullAll();
  }

  /**
   * "Sign out and erase local data" — for shared machines.
   */
  async function eraseLocalData() {
    await chrome.storage.local.remove([
      'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages',
      QUEUE_KEY, CURSOR_KEY, MIGRATED_KEY, 'lastSyncAt',
    ]);
    queue = [];
    rebuildSnapshotFrom({});
  }

  function onStatus(fn) {
    statusListeners.push(fn);
  }

  function getState() {
    return { status, error: lastError, pending: queue.length, lastSyncAt };
  }

  return {
    init,
    stampChanges,
    onLocalWrite,
    pullAll,
    flush,
    syncNow,
    eraseLocalData,
    onStatus,
    getState,
  };
})();
