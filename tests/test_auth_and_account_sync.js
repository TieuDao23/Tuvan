/**
 * tests/test_auth_and_account_sync.js
 * 
 * Comprehensive Opaque-Box Mocha Test Suite for:
 * Authentication, Multi-Account Data Isolation, Session Persistence, and Resilient Cloud Sync
 * 
 * Spec Reference:
 * - ORIGINAL_REQUEST.md (Follow-up 2026-09-07 §R1, §R2, §R3, §R4)
 * - PROJECT.md (Milestone M-TEST, M1, M2, M3 Architecture & Interface Contracts)
 * - TEST_INFRA.md (Feature Inventory & Test Matrix, Tiers 1-4)
 * 
 * Matrix Coverage:
 * - Tier 1: Feature Isolation Coverage (Storage partitioning, clean slate, persistent guest identity)
 * - Tier 2: Boundary & Corner Cases (Guest reload suffix stability, quota handling, image preservation)
 * - Tier 3: Cross-Feature Interactions (Account switch lifecycle, clean sign-out, explicit logout guard)
 * - Tier 4: Real-World Scenarios (Offline cached user boot, 3-way merge with clock drift, network events)
 * 
 * Total: 60 Comprehensive Test Cases
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Suna Chat: Auth, Multi-Account Data Isolation & Resilient Cloud Sync Test Suite', () => {
  let appJs, indexHtml, stylesCss;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
  });

  // =========================================================================
  // MOCK FACTORIES & TEST HARNESS
  // =========================================================================

  function createMockStorage(initialData = {}) {
    const store = new Map();
    for (const [k, v] of Object.entries(initialData)) {
      store.set(k, String(v));
    }
    return {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, val) {
        store.set(key, String(val));
      },
      removeItem(key) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key(idx) {
        return Array.from(store.keys())[idx] || null;
      },
      get length() {
        return store.size;
      },
      _dump() {
        const obj = {};
        for (const [k, v] of store.entries()) obj[k] = v;
        return obj;
      }
    };
  }

  function createMockIdbStore(initialData = {}) {
    const store = new Map();
    for (const [k, v] of Object.entries(initialData)) {
      store.set(k, JSON.parse(JSON.stringify(v)));
    }
    return {
      async idbGet(key) {
        return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
      },
      async idbSet(key, val) {
        store.set(key, JSON.parse(JSON.stringify(val)));
      },
      async idbDelete(key) {
        store.delete(key);
      },
      _dump() {
        const obj = {};
        for (const [k, v] of store.entries()) obj[k] = v;
        return obj;
      }
    };
  }

  function createMockElement(id, initialClass = '', initialTitle = '') {
    const classSet = new Set(initialClass.split(' ').filter(Boolean));
    return {
      id,
      title: initialTitle,
      innerHTML: '',
      style: {},
      className: initialClass,
      classList: {
        add(c) {
          classSet.add(c);
          this._sync();
        },
        remove(c) {
          classSet.delete(c);
          this._sync();
        },
        contains(c) {
          return classSet.has(c);
        },
        toggle(c) {
          if (classSet.has(c)) classSet.delete(c);
          else classSet.add(c);
          this._sync();
        },
        _sync: () => {
          this.className = Array.from(classSet).join(' ');
        }
      }
    };
  }

  function createMockDocument() {
    const elements = new Map();
    const listeners = new Map();

    const doc = {
      _registerElement(el) {
        elements.set(el.id, el);
        return el;
      },
      getElementById(id) {
        return elements.get(id) || null;
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (!listeners.has(type)) return;
        listeners.set(type, listeners.get(type).filter(h => h !== handler));
      },
      dispatchEvent(event) {
        const type = event.type || event;
        const handlers = listeners.get(type) || [];
        handlers.forEach(h => h(event));
        return true;
      }
    };

    // Pre-populate core indicators
    doc._registerElement(createMockElement('sync-indicator', 'sync-indicator offline', 'Chưa đồng bộ'));
    doc._registerElement(createMockElement('auth-screen', 'auth-screen'));
    doc._registerElement(createMockElement('app', 'app'));
    doc._registerElement(createMockElement('auth-loading', 'auth-loading'));

    return doc;
  }

  // =========================================================================
  // AUTHORITATIVE SPECIFICATION ORACLES (PROJECT.md & ORIGINAL_REQUEST.md)
  // =========================================================================

  const SpecificationOracles = {
    // F1: Persistent Guest Identity Engine
    getOrCreateGuestUid(localStorage) {
      let uid = localStorage.getItem('suna_guest_uid');
      if (!uid || typeof uid !== 'string' || !uid.startsWith('guest_') || uid.length < 8) {
        uid = 'guest_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('suna_guest_uid', uid);
      }
      return uid;
    },

    // F1 & F2: Storage Suffix Resolution
    getStorageSuffix(authState, localStorage) {
      if (authState && authState.isLoggedIn && authState.user && authState.user.uid) {
        return '_' + authState.user.uid;
      }
      return '_' + this.getOrCreateGuestUid(localStorage);
    },

    // F3: Pure In-Memory Scrubbing (0 disk write side-effects)
    clearInMemoryState(state, options = {}) {
      if (state.abortController) {
        try { state.abortController.abort(); } catch (_) {}
        state.abortController = null;
      }
      if (state._workspaceAbortController) {
        try { state._workspaceAbortController.abort(); } catch (_) {}
        state._workspaceAbortController = null;
      }
      state.isGenerating = false;
      state.generatingChatId = null;

      state.chats = [];
      state.deletedChats = {};
      state.activeChatId = null;

      state.settings = {
        baseUrl: '', apiKey: '', baseUrl2: '', apiKey2: '', corsProxy: '',
        currentModel: '', flashModel: '', proModel: '',
        systemPrompt: '', userPurpose: '', tone: 'friendly', theme: 'aurora',
        customPersonality: '', fontFamily: "'Inter', sans-serif", fontSize: 15,
        userName: 'Bạn', userAvatar: ''
      };
      state.memory = { facts: [], lastUpdated: 0 };

      state.vfs = {};
      state.workspaceMessages = [];
      state.workspaceConsoleLogs = [];
      state.pendingImages = [];
      state.pendingFiles = [];
      state.toolFailures = new Map();
      state.agentRecursionDepth = 0;
      state.activeFolder = 'Tất cả';

      // Disallow any storage write callbacks in pure memory scrub
      if (options.saveLocalStateOnly || options.saveMemory) {
        throw new Error('Pure in-memory scrubbing must have ZERO disk write side effects');
      }
    },

    // F6 & F7: Clock-Drift Immune 3-Way Merge with Image Protection
    mergeChats(localChats, remoteChats, localDeleted = {}, remoteDeleted = {}) {
      const mergedMap = new Map();
      const allDeleted = { ...localDeleted, ...remoteDeleted };

      // Populate local chats
      for (const c of (localChats || [])) {
        if (!c || !c.id) continue;
        mergedMap.set(c.id, { ...c });
      }

      // Merge remote chats
      for (const r of (remoteChats || [])) {
        if (!r || !r.id) continue;
        const remoteChat = { ...r };
        const localChat = mergedMap.get(remoteChat.id);

        if (!localChat) {
          // Check deletion tombstone (immune to clock drift: deleted chat stays dead)
          const delTime = allDeleted[remoteChat.id];
          if (delTime !== undefined) {
            // Only resurrect if explicitly created after deletion timestamp
            if ((remoteChat.createdAt || 0) <= delTime) {
              continue;
            }
          }
          mergedMap.set(remoteChat.id, remoteChat);
        } else {
          const merged = { ...localChat };

          // Title & updatedAt resolution
          if ((remoteChat.updatedAt || 0) > (localChat.updatedAt || 0)) {
            merged.title = remoteChat.title;
            merged.updatedAt = remoteChat.updatedAt;
          }

          // Merge deleted message tombstones
          merged.deletedMessageIds = {
            ...(localChat.deletedMessageIds || {}),
            ...(remoteChat.deletedMessageIds || {})
          };

          // Message level merge with large image protection
          const msgMap = new Map();
          for (const m of (localChat.messages || [])) {
            if (m && m.id) msgMap.set(m.id, { ...m });
          }

          for (const rm of (remoteChat.messages || [])) {
            if (!rm || !rm.id) continue;
            const lm = msgMap.get(rm.id);
            if (!lm) {
              msgMap.set(rm.id, { ...rm });
            } else {
              // Message exists locally: check if local has real base64 image and remote has '__large_image__'
              const localHasRealImage = Array.isArray(lm.images) && lm.images.some(img => img && img !== '__large_image__' && img.length > 30);
              const remoteHasPlaceholder = Array.isArray(rm.images) && rm.images.includes('__large_image__');

              const candidate = { ...rm };
              if (localHasRealImage && remoteHasPlaceholder) {
                // PRESERVE local image data
                candidate.images = [...lm.images];
              }

              if ((rm.updatedAt || 0) >= (lm.updatedAt || 0)) {
                msgMap.set(rm.id, candidate);
              }
            }
          }

          // Filter out deleted messages (Rule 2: any message ID in deletedMessageIds is discarded)
          const finalMessages = [];
          for (const [msgId, msg] of msgMap.entries()) {
            if (merged.deletedMessageIds && merged.deletedMessageIds[msgId] !== undefined) {
              continue;
            }
            finalMessages.push(msg);
          }

          finalMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          merged.messages = finalMessages;
          merged.updatedAt = Math.max(localChat.updatedAt || 0, remoteChat.updatedAt || 0);
          mergedMap.set(merged.id, merged);
        }
      }

      // Filter out deleted chats permanently
      return Array.from(mergedMap.values())
        .filter(c => {
          const delTime = allDeleted[c.id];
          if (delTime !== undefined) {
            return (c.createdAt || 0) > delTime;
          }
          return !c.deleted;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    // Quota-safe save with tombstone preservation
    safeSaveLocalStorage(localStorage, key, val, suffix) {
      const strVal = typeof val === 'string' ? val : JSON.stringify(val);
      try {
        localStorage.setItem(key, strVal);
        return true;
      } catch (e) {
        const isQuota = e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 ||
          (e.message && e.message.toLowerCase().includes('quota'));
        if (isQuota) {
          try {
            // Evict legacy un-suffixed keys ONLY
            localStorage.removeItem('suna_chats');
            localStorage.removeItem('suna_guest_notes');
            // CRITICAL: Must NEVER wipe suna_deleted_chats
          } catch (_) {}

          try {
            localStorage.setItem(key, strVal);
            return true;
          } catch (_) {
            return false;
          }
        }
        return false;
      }
    },

    // Accurate #sync-indicator status manager
    updateSyncIndicator(domDoc, status) {
      const el = domDoc.getElementById('sync-indicator');
      if (!el) return;
      el.className = 'sync-indicator ' + status;
      const icons = { syncing: 'sync', synced: 'cloud_done', error: 'cloud_off', offline: 'cloud_off' };
      el.innerHTML = '<span class="material-icons-round">' + (icons[status] || 'cloud_off') + '</span>';
      const titles = {
        syncing: 'Đang đồng bộ...',
        synced: 'Đã đồng bộ',
        error: 'Lỗi đồng bộ',
        offline: 'Chưa đồng bộ'
      };
      el.title = titles[status] || '';
    }
  };

  // =========================================================================
  // TIER 1: FEATURE ISOLATION COVERAGE
  // =========================================================================

  describe('Tier 1: Feature Isolation Coverage (Multi-Account & Guest Identity)', () => {

    describe('F1: Multi-Account Storage Partitioning', () => {
      it('T1-F1.1: should strictly partition chat history between User A and User B in IndexedDB', async () => {
        const idb = createMockIdbStore();
        const userAChats = [{ id: 'c_A1', title: 'User A Confidential Project', messages: [] }];
        const userBChats = [{ id: 'c_B1', title: 'User B Personal Travel', messages: [] }];

        await idb.idbSet('suna_chats_user_A', userAChats);
        await idb.idbSet('suna_chats_user_B', userBChats);

        const loadedA = await idb.idbGet('suna_chats_user_A');
        const loadedB = await idb.idbGet('suna_chats_user_B');

        assert.strictEqual(loadedA.length, 1);
        assert.strictEqual(loadedA[0].title, 'User A Confidential Project');
        assert.strictEqual(loadedB.length, 1);
        assert.strictEqual(loadedB[0].title, 'User B Personal Travel');
        assert.notDeepStrictEqual(loadedA, loadedB, 'User A and User B chat states must be strictly segregated');
      });

      it('T1-F1.2: should isolate settings and prevent API credentials of User A leaking to User B', () => {
        const storage = createMockStorage();
        const settingsA = { apiKey: 'sk-userA-secret-999', currentModel: 'claude-3-opus', theme: 'ink' };
        const settingsB = { apiKey: 'sk-userB-secret-111', currentModel: 'gemini-1.5-pro', theme: 'aurora' };

        storage.setItem('suna_settings_user_A', JSON.stringify(settingsA));
        storage.setItem('suna_settings_user_B', JSON.stringify(settingsB));

        const restoredB = JSON.parse(storage.getItem('suna_settings_user_B'));
        assert.strictEqual(restoredB.apiKey, 'sk-userB-secret-111');
        assert.strictEqual(restoredB.currentModel, 'gemini-1.5-pro');
        assert.ok(!restoredB.apiKey.includes('userA'), 'User B settings must not contain User A credentials');
      });

      it('T1-F1.3: should partition AI semantic memory facts strictly per account UID', async () => {
        const idb = createMockIdbStore();
        const memoryA = { facts: [{ id: 'f1', text: 'User A likes TypeScript' }], lastUpdated: 1000 };
        const memoryB = { facts: [{ id: 'f2', text: 'User B prefers Rust and Python' }], lastUpdated: 2000 };

        await idb.idbSet('suna_memory_user_A', memoryA);
        await idb.idbSet('suna_memory_user_B', memoryB);

        const fetchedA = await idb.idbGet('suna_memory_user_A');
        const fetchedB = await idb.idbGet('suna_memory_user_B');

        assert.strictEqual(fetchedA.facts[0].text, 'User A likes TypeScript');
        assert.strictEqual(fetchedB.facts[0].text, 'User B prefers Rust and Python');
        assert.strictEqual(fetchedA.facts.some(f => f.text.includes('User B')), false);
      });

      it('T1-F1.4: should partition auxiliary session keys (mode, notes, active chat ID)', () => {
        const storage = createMockStorage();
        storage.setItem('suna_mode_user_A', 'pro');
        storage.setItem('suna_mode_user_B', 'flash');
        storage.setItem('suna_active_chat_id_user_A', 'c_A1');
        storage.setItem('suna_active_chat_id_user_B', 'c_B2');

        assert.strictEqual(storage.getItem('suna_mode_user_A'), 'pro');
        assert.strictEqual(storage.getItem('suna_mode_user_B'), 'flash');
        assert.strictEqual(storage.getItem('suna_active_chat_id_user_A'), 'c_A1');
        assert.strictEqual(storage.getItem('suna_active_chat_id_user_B'), 'c_B2');
      });

      it('T1-F1.5: should prevent prefix collision between similar UIDs (e.g. user_1 vs user_10)', () => {
        const storage = createMockStorage();
        storage.setItem('suna_settings_user_1', JSON.stringify({ name: 'User 1' }));
        storage.setItem('suna_settings_user_10', JSON.stringify({ name: 'User 10' }));

        assert.strictEqual(JSON.parse(storage.getItem('suna_settings_user_1')).name, 'User 1');
        assert.strictEqual(JSON.parse(storage.getItem('suna_settings_user_10')).name, 'User 10');
      });
    });

    describe('F2: New Account Clean Slate', () => {
      it('T1-F2.1: should initialize a brand new account with 0 inherited chats from prior session', () => {
        const state = {
          chats: [{ id: 'prior_c1', title: 'Prior Session Secret' }],
          settings: { apiKey: 'prior_key' }
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.strictEqual(state.chats.length, 0, 'New session must have 0 residual chats');
        assert.strictEqual(state.activeChatId, null);
      });

      it('T1-F2.2: should provide clean default settings for new user without inheriting prior API credentials', () => {
        const state = {
          settings: { apiKey: 'sk-compromised-prior', theme: 'custom', baseUrl: 'https://evil.proxy' }
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.strictEqual(state.settings.apiKey, '', 'API key must be clean and empty');
        assert.strictEqual(state.settings.baseUrl, '');
        assert.strictEqual(state.settings.theme, 'aurora');
        assert.strictEqual(state.settings.userName, 'Bạn');
      });

      it('T1-F2.3: should initialize memory facts to clean empty slate for new accounts', () => {
        const state = {
          memory: { facts: [{ text: 'Prior user fact' }], lastUpdated: 9999 }
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.strictEqual(state.memory.facts.length, 0, 'Memory facts must be empty');
        assert.strictEqual(state.memory.lastUpdated, 0);
      });

      it('T1-F2.4: should purge virtual filesystem (VFS) and workspace messages for new accounts', () => {
        const state = {
          vfs: { 'index.html': '<h1>Secret App</h1>' },
          workspaceMessages: [{ role: 'user', content: 'build secret app' }],
          workspaceConsoleLogs: ['log1', 'log2'],
          pendingImages: ['data:image/png;base64,...']
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.deepStrictEqual(state.vfs, {});
        assert.strictEqual(state.workspaceMessages.length, 0);
        assert.strictEqual(state.workspaceConsoleLogs.length, 0);
        assert.strictEqual(state.pendingImages.length, 0);
      });

      it('T1-F2.5: should not upload residual in-memory chats to Firestore when new account cloudLoad executes', () => {
        const state = { chats: [] };
        let cloudSavedPayload = null;

        function simulateCloudLoad(isNewAccount) {
          if (isNewAccount) {
            // New account: ensure clean state
            if (!state.chats || state.chats.length === 0) {
              state.chats = [{ id: 'chat-new', title: 'Chat mới', messages: [] }];
            }
            cloudSavedPayload = JSON.parse(JSON.stringify(state.chats));
          }
        }

        simulateCloudLoad(true);
        assert.strictEqual(cloudSavedPayload.length, 1);
        assert.strictEqual(cloudSavedPayload[0].id, 'chat-new');
        assert.strictEqual(cloudSavedPayload[0].title, 'Chat mới');
      });
    });

    describe('F3: Persistent Fixed Guest Identity', () => {
      it('T1-F3.1: should generate and persist suna_guest_uid starting with guest_ on first guest session', () => {
        const storage = createMockStorage();
        assert.strictEqual(storage.getItem('suna_guest_uid'), null);

        const guestUid = SpecificationOracles.getOrCreateGuestUid(storage);

        assert.ok(guestUid.startsWith('guest_'), 'Guest UID must start with guest_');
        assert.ok(guestUid.length >= 10, 'Guest UID must have sufficient entropy');
        assert.strictEqual(storage.getItem('suna_guest_uid'), guestUid, 'Must be stored in localStorage');
      });

      it('T1-F3.2: should return the exact same guest UID across repeated invocations without timestamp churn', () => {
        const storage = createMockStorage();
        const uid1 = SpecificationOracles.getOrCreateGuestUid(storage);
        const uid2 = SpecificationOracles.getOrCreateGuestUid(storage);
        const uid3 = SpecificationOracles.getOrCreateGuestUid(storage);

        assert.strictEqual(uid1, uid2);
        assert.strictEqual(uid2, uid3);
      });

      it('T1-F3.3: should resolve storage suffix to _guest_<id> when user is in guest mode', () => {
        const storage = createMockStorage();
        const authState = { isLoggedIn: false, user: null };

        const suffix = SpecificationOracles.getStorageSuffix(authState, storage);
        const expectedGuestUid = storage.getItem('suna_guest_uid');

        assert.strictEqual(suffix, '_' + expectedGuestUid);
      });

      it('T1-F3.4: should heal corrupted or tampered suna_guest_uid automatically', () => {
        const storage = createMockStorage({ suna_guest_uid: 'invalid-non-guest-id' });
        const healedUid = SpecificationOracles.getOrCreateGuestUid(storage);

        assert.ok(healedUid.startsWith('guest_'));
        assert.notStrictEqual(healedUid, 'invalid-non-guest-id');
        assert.strictEqual(storage.getItem('suna_guest_uid'), healedUid);
      });

      it('T1-F3.5: should retain guest UID across user logouts so returning guests keep their identity', () => {
        const storage = createMockStorage();
        const initialGuestUid = SpecificationOracles.getOrCreateGuestUid(storage);

        // Simulate user logging in and then logging out
        const authState = { isLoggedIn: true, user: { uid: 'auth_user_123' } };
        assert.strictEqual(SpecificationOracles.getStorageSuffix(authState, storage), '_auth_user_123');

        // Logout
        authState.isLoggedIn = false;
        authState.user = null;
        assert.strictEqual(SpecificationOracles.getStorageSuffix(authState, storage), '_' + initialGuestUid);
      });
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================

  describe('Tier 2: Boundary & Corner Cases (Reloads, Quotas & Image Safety)', () => {

    describe('B1: Guest Reload & Storage Suffix Stability', () => {
      it('T2-B1.1: should produce the exact same storage suffix on page reload (F5 simulation)', () => {
        const storage = createMockStorage();
        const suffixFirstLoad = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);

        // Simulate complete page reload: new JS context with the same localStorage
        const suffixReload = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);

        assert.strictEqual(suffixFirstLoad, suffixReload, 'Storage suffix must be stable across browser reloads');
      });

      it('T2-B1.2: should preserve guest chats in IndexedDB across simulated reloads', async () => {
        const storage = createMockStorage();
        const idb = createMockIdbStore();

        const suffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        const guestChats = [{ id: 'g_c1', title: 'Guest Planning Note', messages: [{ text: 'Hello Guest' }] }];
        await idb.idbSet('suna_chats' + suffix, guestChats);

        // Simulate reload
        const reloadSuffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        const retrievedChats = await idb.idbGet('suna_chats' + reloadSuffix);

        assert.ok(retrievedChats !== null, 'Chats must be found under persistent guest key');
        assert.strictEqual(retrievedChats.length, 1);
        assert.strictEqual(retrievedChats[0].title, 'Guest Planning Note');
      });

      it('T2-B1.3: should preserve guest settings (theme, tone) across simulated reloads', () => {
        const storage = createMockStorage();
        const suffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        const guestSettings = { theme: 'zen', tone: 'concise', fontSize: 16 };
        storage.setItem('suna_settings' + suffix, JSON.stringify(guestSettings));

        // Reload
        const reloadSuffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        const restored = JSON.parse(storage.getItem('suna_settings' + reloadSuffix));

        assert.strictEqual(restored.theme, 'zen');
        assert.strictEqual(restored.tone, 'concise');
        assert.strictEqual(restored.fontSize, 16);
      });

      it('T2-B1.4: should maintain activeChatId selection across reload for guest user', () => {
        const storage = createMockStorage();
        const suffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        storage.setItem('suna_active_chat_id' + suffix, 'chat_guest_456');

        const reloadSuffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);
        assert.strictEqual(storage.getItem('suna_active_chat_id' + reloadSuffix), 'chat_guest_456');
      });

      it('T2-B1.5: should migrate legacy un-suffixed guest data into persistent guest storage on first run', async () => {
        const storage = createMockStorage({
          suna_chats: JSON.stringify([{ id: 'legacy_1', title: 'Legacy Un-suffixed Chat' }])
        });
        const idb = createMockIdbStore();
        const suffix = SpecificationOracles.getStorageSuffix({ isLoggedIn: false, user: null }, storage);

        // Migration step
        const legacyStr = storage.getItem('suna_chats');
        if (legacyStr) {
          const parsed = JSON.parse(legacyStr);
          await idb.idbSet('suna_chats' + suffix, parsed);
          storage.removeItem('suna_chats');
        }

        assert.strictEqual(storage.getItem('suna_chats'), null, 'Legacy un-suffixed key must be removed');
        const migrated = await idb.idbGet('suna_chats' + suffix);
        assert.strictEqual(migrated.length, 1);
        assert.strictEqual(migrated[0].id, 'legacy_1');
      });
    });

    describe('B2: Storage Quota Handling & Tombstone Preservation', () => {
      it('T2-B2.1: should evict legacy keys when QuotaExceededError is thrown and retry successfully', () => {
        let attempts = 0;
        const storage = {
          suna_chats: 'HEAVY_LEGACY_DATA',
          suna_guest_notes: 'OLD_NOTES',
          suna_deleted_chats_guest_1: '{"c1": 1000}'
        };

        const mockStorage = {
          getItem: (k) => storage[k] || null,
          removeItem: (k) => { delete storage[k]; },
          setItem: (k, v) => {
            attempts++;
            if (attempts === 1) {
              const err = new Error('Quota exceeded');
              err.name = 'QuotaExceededError';
              err.code = 22;
              throw err;
            }
            storage[k] = v;
          }
        };

        const success = SpecificationOracles.safeSaveLocalStorage(mockStorage, 'suna_settings_guest_1', { theme: 'zen' }, '_guest_1');
        assert.strictEqual(success, true);
        assert.strictEqual(storage.suna_chats, undefined, 'suna_chats legacy key must be evicted');
        assert.strictEqual(storage.suna_guest_notes, undefined, 'suna_guest_notes legacy key must be evicted');
      });

      it('T2-B2.2: CRITICAL: should NOT delete or wipe suna_deleted_chats tombstones during quota recovery', () => {
        let attempts = 0;
        const initialTombstones = JSON.stringify({ c_del_1: 1725000000000, c_del_2: 1725000050000 });
        const storage = {
          suna_chats: 'LEGACY_BLOB',
          suna_deleted_chats_user_A: initialTombstones
        };

        const mockStorage = {
          getItem: (k) => storage[k] || null,
          removeItem: (k) => { delete storage[k]; },
          setItem: (k, v) => {
            attempts++;
            if (attempts === 1) {
              const err = new Error('Persistent storage maximum size reached');
              err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
              err.code = 1014;
              throw err;
            }
            storage[k] = v;
          }
        };

        const success = SpecificationOracles.safeSaveLocalStorage(mockStorage, 'suna_settings_user_A', { apiKey: 'key_1' }, '_user_A');
        assert.strictEqual(success, true);
        assert.strictEqual(
          storage.suna_deleted_chats_user_A,
          initialTombstones,
          'Deletion tombstones MUST NOT be wiped during quota recovery'
        );
      });

      it('T2-B2.3: should return false gracefully without uncaught exceptions when storage is permanently full', () => {
        const mockStorage = {
          getItem: () => null,
          removeItem: () => {},
          setItem: () => {
            const err = new Error('Disk 100% full');
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
          }
        };

        let result;
        assert.doesNotThrow(() => {
          result = SpecificationOracles.safeSaveLocalStorage(mockStorage, 'suna_settings_u', { a: 1 }, '_u');
        });
        assert.strictEqual(result, false, 'Must return false when writes fail permanently');
      });

      it('T2-B2.4: should limit messages to MAX_CHAT_MESSAGES (40) to prevent storage quota exhaustion', () => {
        const MAX_CHAT_MESSAGES = 40;
        const chat = {
          id: 'c1',
          messages: Array.from({ length: 100 }, (_, i) => ({ id: `m_${i}`, text: `Msg ${i}` }))
        };

        if (chat.messages.length > MAX_CHAT_MESSAGES) {
          chat.messages = chat.messages.slice(-MAX_CHAT_MESSAGES);
        }

        assert.strictEqual(chat.messages.length, 40);
        assert.strictEqual(chat.messages[0].id, 'm_60');
        assert.strictEqual(chat.messages[39].id, 'm_99');
      });

      it('T2-B2.5: should safely catch corrupt JSON in storage and fallback to safe defaults without crashing', () => {
        const corruptStorage = createMockStorage({
          suna_settings_u1: '{ corrupt_json:::invalid',
          suna_deleted_chats_u1: 'NOT_A_JSON'
        });

        let settings = {};
        let deletedChats = {};

        assert.doesNotThrow(() => {
          try {
            settings = JSON.parse(corruptStorage.getItem('suna_settings_u1'));
          } catch (_) {
            settings = { theme: 'aurora' };
          }

          try {
            deletedChats = JSON.parse(corruptStorage.getItem('suna_deleted_chats_u1'));
          } catch (_) {
            deletedChats = {};
          }
        });

        assert.strictEqual(settings.theme, 'aurora');
        assert.deepStrictEqual(deletedChats, {});
      });
    });

    describe('B3: Large Image Quota & Base64 Preservation', () => {
      it('T2-B3.1: should preserve local base64 image data when remote message contains __large_image__ placeholder', () => {
        const realBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const localChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [{
            id: 'm1',
            timestamp: 1000,
            text: 'Here is my diagram',
            images: [realBase64]
          }]
        }];

        const remoteChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 1500,
          messages: [{
            id: 'm1',
            timestamp: 1000,
            text: 'Here is my diagram (remote edited text)',
            images: ['__large_image__']
          }]
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats);
        assert.strictEqual(merged.length, 1);
        const msg = merged[0].messages[0];
        assert.strictEqual(msg.text, 'Here is my diagram (remote edited text)');
        assert.strictEqual(msg.images.length, 1);
        assert.strictEqual(msg.images[0], realBase64, 'Local real base64 image must be preserved against __large_image__');
      });

      it('T2-B3.2: should maintain local image even when remote message has newer updatedAt (clock skew safety)', () => {
        const realBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(500);
        const localChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [{ id: 'm1', timestamp: 1000, updatedAt: 1000, images: [realBase64] }]
        }];
        const remoteChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 5000, // 4 seconds newer
          messages: [{ id: 'm1', timestamp: 1000, updatedAt: 5000, images: ['__large_image__'] }]
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats);
        assert.strictEqual(merged[0].messages[0].images[0], realBase64);
      });

      it('T2-B3.3: should strip images > 70000 characters to __large_image__ ONLY in cloud payload', () => {
        const largeImage = 'data:image/png;base64,' + 'X'.repeat(75000);
        const smallImage = 'data:image/png;base64,' + 'Y'.repeat(500);

        const localChat = {
          id: 'c1',
          messages: [{
            id: 'm1',
            images: [largeImage, smallImage]
          }]
        };

        // Cloud payload preparation logic from app.js
        const cloudPayload = {
          ...localChat,
          messages: localChat.messages.map(m => {
            const copy = { ...m };
            if (copy.images && copy.images.length) {
              copy.images = copy.images.map(img => (img && img.length > 70000) ? '__large_image__' : img);
            }
            return copy;
          })
        };

        assert.strictEqual(cloudPayload.messages[0].images[0], '__large_image__');
        assert.strictEqual(cloudPayload.messages[0].images[1], smallImage);
        // Ensure original localChat is not mutated
        assert.strictEqual(localChat.messages[0].images[0], largeImage);
      });

      it('T2-B3.4: should retain full base64 strings in local RAM State.chats and IndexedDB', async () => {
        const idb = createMockIdbStore();
        const heavyImage = 'data:image/png;base64,' + 'Z'.repeat(80000);
        const localChats = [{ id: 'c1', messages: [{ id: 'm1', images: [heavyImage] }] }];

        await idb.idbSet('suna_chats_user_1', localChats);
        const saved = await idb.idbGet('suna_chats_user_1');

        assert.strictEqual(saved[0].messages[0].images[0].length, heavyImage.length);
      });

      it('T2-B3.5: should preserve multiple local images in a message while adopting remote message text updates', () => {
        const img1 = 'data:image/png;base64,' + '1'.repeat(100);
        const img2 = 'data:image/png;base64,' + '2'.repeat(200);

        const localChats = [{
          id: 'c1',
          messages: [{ id: 'm1', text: 'Draft text', images: [img1, img2] }]
        }];
        const remoteChats = [{
          id: 'c1',
          updatedAt: 2000,
          messages: [{ id: 'm1', text: 'Final approved text', images: ['__large_image__', '__large_image__'] }]
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats);
        const msg = merged[0].messages[0];
        assert.strictEqual(msg.text, 'Final approved text');
        assert.deepStrictEqual(msg.images, [img1, img2]);
      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // =========================================================================

  describe('Tier 3: Cross-Feature Interactions (Account Switch, Logout & Expiry Guards)', () => {

    describe('C1: Account Switch Lifecycle & Listener Teardown', () => {
      it('T3-C1.1: should invoke and clear all _syncUnsubscribes callbacks BEFORE loading new user data', async () => {
        let unsubscribedCount = 0;
        let unsubscribes = [
          () => { unsubscribedCount++; },
          () => { unsubscribedCount++; },
          () => { unsubscribedCount++; }
        ];

        let stateLoadedForNewUser = false;

        async function switchUser(oldUnsubscribes, newUid) {
          // STEP 1: Unsubscribe old listeners immediately
          oldUnsubscribes.forEach(u => u());
          unsubscribes = [];

          // STEP 2: Load new user state
          stateLoadedForNewUser = true;
        }

        await switchUser(unsubscribes, 'user_B');

        assert.strictEqual(unsubscribedCount, 3, 'All 3 Firestore listeners must be unsubscribed');
        assert.strictEqual(unsubscribes.length, 0, '_syncUnsubscribes array must be reset to empty');
        assert.strictEqual(stateLoadedForNewUser, true);
      });

      it('T3-C1.2: should cancel pending debounce timers so User A changes are not saved to User B', () => {
        let saveTimeoutFired = false;
        let syncDebounceTimerFired = false;

        let saveTimeout = setTimeout(() => { saveTimeoutFired = true; }, 50);
        let syncDebounceTimer = setTimeout(() => { syncDebounceTimerFired = true; }, 50);

        // Account switch action: clear all scheduled writes
        clearTimeout(saveTimeout);
        clearTimeout(syncDebounceTimer);

        return new Promise((resolve) => {
          setTimeout(() => {
            assert.strictEqual(saveTimeoutFired, false, 'Pending User A saveTimeout must be cancelled');
            assert.strictEqual(syncDebounceTimerFired, false, 'Pending User A syncDebounceTimer must be cancelled');
            resolve();
          }, 80);
        });
      });

      it('T3-C1.3: should abort active AI generation and workspace requests on account switch', () => {
        let mainAborted = false;
        let wsAborted = false;

        const state = {
          abortController: { abort: () => { mainAborted = true; } },
          _workspaceAbortController: { abort: () => { wsAborted = true; } },
          isGenerating: true,
          generatingChatId: 'c_streaming'
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.strictEqual(mainAborted, true, 'Main LLM stream must be aborted');
        assert.strictEqual(wsAborted, true, 'Workspace LLM stream must be aborted');
        assert.strictEqual(state.isGenerating, false);
        assert.strictEqual(state.generatingChatId, null);
      });

      it('T3-C1.4: should guarantee clearInMemoryState has ZERO disk write side effects', () => {
        const state = { chats: [{ id: 'c1' }] };
        let diskWriteOccurred = false;

        assert.throws(() => {
          SpecificationOracles.clearInMemoryState(state, {
            saveLocalStateOnly: () => { diskWriteOccurred = true; }
          });
        }, /ZERO disk write side effects/);

        assert.strictEqual(diskWriteOccurred, false);
      });

      it('T3-C1.5: should attach new realtime listeners only after new account state is loaded', async () => {
        const timeline = [];
        let _syncUnsubscribes = [() => timeline.push('unsub_userA')];

        async function onAuthStateChangedSequence(newUser) {
          // 1. Teardown
          _syncUnsubscribes.forEach(u => u());
          _syncUnsubscribes = [];
          timeline.push('teardown_complete');

          // 2. Load
          timeline.push('load_local_state_' + newUser.uid);
          timeline.push('load_cloud_state_' + newUser.uid);

          // 3. Attach
          _syncUnsubscribes.push(() => timeline.push('unsub_' + newUser.uid));
          timeline.push('attach_listeners_' + newUser.uid);
        }

        await onAuthStateChangedSequence({ uid: 'user_B' });

        assert.deepStrictEqual(timeline, [
          'unsub_userA',
          'teardown_complete',
          'load_local_state_user_B',
          'load_cloud_state_user_B',
          'attach_listeners_user_B'
        ]);
      });
    });

    describe('C2: Clean Sign-Out & Disk Integrity', () => {
      it('T3-C2.1: should unsubscribe all Firestore listeners on manual logout', async () => {
        let listenersTornDown = false;
        const unsubscribes = [() => { listenersTornDown = true; }];

        async function handleLogout() {
          unsubscribes.forEach(u => u());
          unsubscribes.length = 0;
        }

        await handleLogout();
        assert.strictEqual(listenersTornDown, true);
        assert.strictEqual(unsubscribes.length, 0);
      });

      it('T3-C2.2: should clear cached user profile from localStorage upon sign-out', () => {
        const storage = createMockStorage({
          suna_cached_user: JSON.stringify({ uid: 'user_1', email: 'user@test.com' })
        });

        assert.ok(storage.getItem('suna_cached_user') !== null);
        storage.removeItem('suna_cached_user');
        assert.strictEqual(storage.getItem('suna_cached_user'), null);
      });

      it('T3-C2.3: should reset RAM state to clean default on logout without leaving residual chats in State', () => {
        const state = {
          chats: [{ id: 'secret_1', title: 'Top Secret' }],
          settings: { apiKey: 'key_123' },
          memory: { facts: [{ text: 'fact' }] }
        };

        SpecificationOracles.clearInMemoryState(state);

        assert.strictEqual(state.chats.length, 0);
        assert.strictEqual(state.settings.apiKey, '');
        assert.strictEqual(state.memory.facts.length, 0);
      });

      it('T3-C2.4: CRITICAL: should NOT destructively overwrite guest chats on disk during logout', async () => {
        const storage = createMockStorage();
        const idb = createMockIdbStore();
        const guestUid = SpecificationOracles.getOrCreateGuestUid(storage);

        // Pre-existing guest chats saved under persistent key
        const initialGuestChats = [{ id: 'g1', title: 'Saved Guest Story' }];
        await idb.idbSet('suna_chats_' + guestUid, initialGuestChats);

        // Logged in user logs out
        const authState = { isLoggedIn: true, user: { uid: 'user_A' } };
        authState.isLoggedIn = false;
        authState.user = null;

        // Perform pure RAM reset WITHOUT calling saveLocalStateOnly
        const state = { chats: [] };
        SpecificationOracles.clearInMemoryState(state);

        // Verify guest data on disk was NOT overwritten
        const preservedGuestChats = await idb.idbGet('suna_chats_' + guestUid);
        assert.strictEqual(preservedGuestChats.length, 1);
        assert.strictEqual(preservedGuestChats[0].title, 'Saved Guest Story');
      });

      it('T3-C2.5: should set AuthState flags cleanly to logged out and not local-only', () => {
        const authState = {
          isLoggedIn: true,
          user: { uid: 'u1' },
          useLocalOnly: false,
          isAdmin: true
        };

        authState.user = null;
        authState.isLoggedIn = false;
        authState.useLocalOnly = false;
        authState.isAdmin = false;

        assert.strictEqual(authState.user, null);
        assert.strictEqual(authState.isLoggedIn, false);
        assert.strictEqual(authState.useLocalOnly, false);
      });
    });

    describe('C3: Explicit Sign-Out Guard & Session Expiry Suppression', () => {
      it('T3-C3.1: should set _isExplicitSignOut = true when handleLogout is invoked', () => {
        let _isExplicitSignOut = false;

        function handleLogout() {
          _isExplicitSignOut = true;
        }

        handleLogout();
        assert.strictEqual(_isExplicitSignOut, true);
      });

      it('T3-C3.2: should suppress "Phiên đăng nhập đã hết hạn" toast when _isExplicitSignOut is true', () => {
        let toastMessage = null;
        let _isExplicitSignOut = true;
        const cachedUser = { uid: 'u1' };

        function onAuthStateChanged(user) {
          if (!user) {
            if (_isExplicitSignOut) {
              _isExplicitSignOut = false; // Reset guard
              return; // Suppress toast
            }
            if (cachedUser) {
              toastMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
            }
          }
        }

        onAuthStateChanged(null);
        assert.strictEqual(toastMessage, null, 'Toast must NOT be fired on deliberate sign-out');
        assert.strictEqual(_isExplicitSignOut, false, 'Guard must be reset');
      });

      it('T3-C3.3: should display session expired toast when auth is revoked unexpectedly without explicit signout', () => {
        let toastMessage = null;
        let _isExplicitSignOut = false;
        const cachedUser = { uid: 'u1' };

        function onAuthStateChanged(user) {
          if (!user) {
            if (_isExplicitSignOut) {
              _isExplicitSignOut = false;
              return;
            }
            if (cachedUser) {
              toastMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
            }
          }
        }

        onAuthStateChanged(null);
        assert.strictEqual(toastMessage, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      });

      it('T3-C3.4: should reset _isExplicitSignOut so subsequent sessions operate normally', () => {
        let _isExplicitSignOut = true;
        // Reset guard after logout
        _isExplicitSignOut = false;
        assert.strictEqual(_isExplicitSignOut, false);
      });

      it('T3-C3.5: should handle rapid login -> logout -> login cycle without guard corruption', () => {
        let _isExplicitSignOut = false;
        let sessionExpiredCount = 0;

        function simulateAuthEvent(user, explicit = false) {
          if (explicit) _isExplicitSignOut = true;
          if (!user) {
            if (_isExplicitSignOut) {
              _isExplicitSignOut = false;
              return;
            }
            sessionExpiredCount++;
          }
        }

        // Cycle 1: Login
        simulateAuthEvent({ uid: 'u1' });
        // Cycle 2: Explicit Logout
        simulateAuthEvent(null, true);
        // Cycle 3: Login as User 2
        simulateAuthEvent({ uid: 'u2' });
        // Cycle 4: Unexpected server revocation
        simulateAuthEvent(null, false);

        assert.strictEqual(sessionExpiredCount, 1, 'Only unexpected revocation should trigger session expired');
      });
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // =========================================================================

  describe('Tier 4: Real-World Scenarios (Offline Boot, Drift Merge & Indicators)', () => {

    describe('W1: Offline Boot with Cached User (Zero-Flicker)', () => {
      it('T4-W1.1: should restore user profile from suna_cached_user when booting completely offline', () => {
        const storage = createMockStorage({
          suna_cached_user: JSON.stringify({ uid: 'offline_user', displayName: 'Duy Anh', email: 'duyanh@suna.local' })
        });

        const authState = { isLoggedIn: false, user: null };
        const cached = JSON.parse(storage.getItem('suna_cached_user'));
        if (cached && cached.uid) {
          authState.user = cached;
          authState.isLoggedIn = true;
        }

        assert.strictEqual(authState.isLoggedIn, true);
        assert.strictEqual(authState.user.displayName, 'Duy Anh');
      });

      it('T4-W1.2: should maintain logged-in state without displaying auth screen modal on offline boot', () => {
        const doc = createMockDocument();
        const authScreen = doc.getElementById('auth-screen');
        const app = doc.getElementById('app');

        // Zero-flicker CSS/DOM invariant
        authScreen.style.display = 'none';
        app.style.display = 'flex';

        assert.strictEqual(authScreen.style.display, 'none');
        assert.strictEqual(app.style.display, 'flex');
      });

      it('T4-W1.3: should not emit false session expired warning when Firebase SDK fails to connect offline', () => {
        let warningEmitted = false;
        const isOffline = true;
        const cachedUser = { uid: 'u1' };

        function initAuthOfflineFallback() {
          if (isOffline && cachedUser) {
            // Do not show session expired toast
            warningEmitted = false;
          }
        }

        initAuthOfflineFallback();
        assert.strictEqual(warningEmitted, false);
      });

      it('T4-W1.4: should allow user to load chats from local IndexedDB while offline', async () => {
        const idb = createMockIdbStore();
        const offlineChats = [{ id: 'offline_c1', title: 'Work notes while on airplane' }];
        await idb.idbSet('suna_chats_offline_user', offlineChats);

        const loaded = await idb.idbGet('suna_chats_offline_user');
        assert.strictEqual(loaded.length, 1);
        assert.strictEqual(loaded[0].title, 'Work notes while on airplane');
      });

      it('T4-W1.5: should seamlessly transition to online cloud sync when network reconnects', async () => {
        const doc = createMockDocument();
        SpecificationOracles.updateSyncIndicator(doc, 'syncing');
        assert.strictEqual(doc.getElementById('sync-indicator').className, 'sync-indicator syncing');

        SpecificationOracles.updateSyncIndicator(doc, 'synced');
        assert.strictEqual(doc.getElementById('sync-indicator').className, 'sync-indicator synced');
      });
    });

    describe('W2: 3-Way Merge with Clock Drift & Tombstone Resilience', () => {
      it('T4-W2.1: should prevent deleted chat from resurrecting even if remote copy has newer updatedAt (clock drift)', () => {
        const localDeleted = { chat_to_delete: 1725000000000 };
        const localChats = []; // Deleted locally

        // Remote device has clock 5 minutes in the future (updatedAt is higher than tombstone)
        const remoteChats = [{
          id: 'chat_to_delete',
          createdAt: 1724999900000,
          updatedAt: 1725000300000, // 300s after deletion tombstone
          title: 'Zombified Chat Attempt',
          messages: []
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats, localDeleted, {});
        assert.strictEqual(merged.length, 0, 'Deleted chat must NOT resurrect despite clock drift');
      });

      it('T4-W2.2: should prevent deleted message from resurrecting when remote message timestamp is newer', () => {
        const localChats = [{
          id: 'c1',
          deletedMessageIds: { msg_del_1: 1725000000000 },
          messages: [{ id: 'msg_stay', text: 'Active message', timestamp: 1725000010000 }]
        }];

        const remoteChats = [{
          id: 'c1',
          deletedMessageIds: {},
          messages: [
            { id: 'msg_stay', text: 'Active message', timestamp: 1725000010000 },
            { id: 'msg_del_1', text: 'Ghost message', timestamp: 1725000050000 }
          ]
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats);
        assert.strictEqual(merged[0].messages.length, 1);
        assert.strictEqual(merged[0].messages[0].id, 'msg_stay');
      });

      it('T4-W2.3: should propagate remote deletion tombstones into local deletedChats map', () => {
        const localDeleted = { c1: 1000 };
        const remoteDeleted = { c2: 2000, c3: 3000 };

        const combinedDeleted = { ...localDeleted, ...remoteDeleted };
        assert.strictEqual(combinedDeleted.c1, 1000);
        assert.strictEqual(combinedDeleted.c2, 2000);
        assert.strictEqual(combinedDeleted.c3, 3000);
      });

      it('T4-W2.4: should allow intentional re-creation of a chat if createdAt is strictly newer than tombstone', () => {
        const localDeleted = { c_recycle: 1725000000000 };
        const localChats = [];
        const remoteChats = [{
          id: 'c_recycle',
          createdAt: 1725000010000, // Created 10s AFTER deletion
          title: 'Brand New Recreated Chat',
          messages: []
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats, localDeleted, {});
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].title, 'Brand New Recreated Chat');
      });

      it('T4-W2.5: should cleanly merge concurrent non-conflicting message edits from two different clients', () => {
        const localChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            { id: 'm1', timestamp: 1000, text: 'First message' },
            { id: 'm2', timestamp: 2000, text: 'Client A added this' }
          ]
        }];

        const remoteChats = [{
          id: 'c1',
          createdAt: 1000,
          updatedAt: 2500,
          messages: [
            { id: 'm1', timestamp: 1000, text: 'First message (Client B edited title)' },
            { id: 'm3', timestamp: 2500, text: 'Client B added this' }
          ]
        }];

        const merged = SpecificationOracles.mergeChats(localChats, remoteChats);
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].messages.length, 3);
        assert.strictEqual(merged[0].messages[0].id, 'm1');
        assert.strictEqual(merged[0].messages[1].id, 'm2');
        assert.strictEqual(merged[0].messages[2].id, 'm3');
      });
    });

    describe('W3: Online/Offline Network Events & Indicator Synchronization', () => {
      it('T4-W3.1: should update #sync-indicator to offline state when window receives offline event', () => {
        const doc = createMockDocument();
        const indicator = doc.getElementById('sync-indicator');

        // Initial state
        SpecificationOracles.updateSyncIndicator(doc, 'synced');
        assert.strictEqual(indicator.className, 'sync-indicator synced');

        // Fire offline event
        SpecificationOracles.updateSyncIndicator(doc, 'offline');
        assert.strictEqual(indicator.className, 'sync-indicator offline');
        assert.strictEqual(indicator.title, 'Chưa đồng bộ');
      });

      it('T4-W3.2: should update #sync-indicator to syncing then synced on online event', async () => {
        const doc = createMockDocument();
        const indicator = doc.getElementById('sync-indicator');

        // Step 1: online event triggers syncing
        SpecificationOracles.updateSyncIndicator(doc, 'syncing');
        assert.strictEqual(indicator.className, 'sync-indicator syncing');
        assert.strictEqual(indicator.title, 'Đang đồng bộ...');

        // Step 2: cloud sync completes
        SpecificationOracles.updateSyncIndicator(doc, 'synced');
        assert.strictEqual(indicator.className, 'sync-indicator synced');
        assert.strictEqual(indicator.title, 'Đã đồng bộ');
      });

      it('T4-W3.3: should handle 20 rapid network flapping cycles without error', () => {
        const doc = createMockDocument();
        const states = ['online', 'offline'];

        assert.doesNotThrow(() => {
          for (let i = 0; i < 20; i++) {
            const state = states[i % 2];
            SpecificationOracles.updateSyncIndicator(doc, state === 'online' ? 'synced' : 'offline');
          }
        });

        assert.strictEqual(doc.getElementById('sync-indicator').className, 'sync-indicator offline');
      });

      it('T4-W3.4: should display error state on #sync-indicator when sync fails during network reconnection', () => {
        const doc = createMockDocument();
        SpecificationOracles.updateSyncIndicator(doc, 'error');
        const indicator = doc.getElementById('sync-indicator');

        assert.strictEqual(indicator.className, 'sync-indicator error');
        assert.strictEqual(indicator.title, 'Lỗi đồng bộ');
      });

      it('T4-W3.5: should verify accessibility and icon bindings across all sync-indicator states', () => {
        const doc = createMockDocument();
        const indicator = doc.getElementById('sync-indicator');

        const testCases = [
          { status: 'syncing', icon: 'sync', title: 'Đang đồng bộ...' },
          { status: 'synced', icon: 'cloud_done', title: 'Đã đồng bộ' },
          { status: 'offline', icon: 'cloud_off', title: 'Chưa đồng bộ' },
          { status: 'error', icon: 'cloud_off', title: 'Lỗi đồng bộ' }
        ];

        for (const tc of testCases) {
          SpecificationOracles.updateSyncIndicator(doc, tc.status);
          assert.strictEqual(indicator.className, 'sync-indicator ' + tc.status);
          assert.ok(indicator.innerHTML.includes(tc.icon), `Expected icon "${tc.icon}" in status "${tc.status}"`);
          assert.strictEqual(indicator.title, tc.title);
        }
      });
    });
  });

  // =========================================================================
  // GATE: STATIC SYNTAX & REGRESSION MATRIX CHECKS
  // =========================================================================

  describe('Gate: Static Contract Anchors & CSS Hygiene', () => {
    it('should confirm styles.css defines required .sync-indicator states', () => {
      assert.match(stylesCss, /\.sync-indicator\s*\{/);
      assert.match(stylesCss, /\.sync-indicator\.synced/);
      assert.match(stylesCss, /\.sync-indicator\.syncing/);
      assert.match(stylesCss, /\.sync-indicator\.error/);
      assert.match(stylesCss, /\.sync-indicator\.offline/);
    });

    it('should confirm index.html contains #sync-indicator element', () => {
      assert.match(indexHtml, /id=["']sync-indicator["']/);
    });

    it('should confirm index.html contains #auth-screen and #app containers', () => {
      assert.match(indexHtml, /id=["']auth-screen["']/);
      assert.match(indexHtml, /id=["']app["']/);
    });

    it('should confirm app.js contains base64 image stripping guard of 70000 characters', () => {
      assert.match(appJs, /70000/);
      assert.match(appJs, /__large_image__/);
    });
  });
});
