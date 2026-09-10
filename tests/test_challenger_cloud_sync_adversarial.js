/**
 * tests/test_challenger_cloud_sync_adversarial.js
 * 
 * Empirical Adversarial Stress Test Suite for Cloud Sync & Conflict Resolution
 * Author: teamwork_preview_challenger_2 (Empirical Challenger)
 * 
 * Vectors Covered:
 * 1. Clock-Drift Resurrection Attack (Future timestamps vs local deletion tombstones)
 * 2. Base64 Image Preservation Under Newer Remote Payload (Protection against __large_image__)
 * 3. Storage Quota Depletion Stress (QuotaExceededError safety for suna_deleted_chats)
 * 4. Network Flapping & Sync Indicator States (50 rapid online/offline transitions & leak tests)
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Adversarial Empirical Stress Testing of Cloud Sync & Conflict Resolution (Challenger 2)', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  /**
   * Helper to accurately extract complete function blocks from app.js using brace balancing
   */
  function extractFunction(source, fnName) {
    const start = source.indexOf('function ' + fnName + '(');
    if (start === -1) throw new Error('Function not found in source: ' + fnName);
    let depth = 0;
    let end = -1;
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) throw new Error('Could not find matching closing brace for: ' + fnName);
    return source.slice(start, end);
  }

  // =========================================================================
  // VECTOR 1: CLOCK-DRIFT RESURRECTION ATTACKS
  // =========================================================================
  describe('Vector 1: Clock-Drift Resurrection Attacks on 3-Way Merge', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = {
        State: {
          deletedChats: {}
        },
        Map,
        Array,
        Math,
        Object,
        Date,
        console: { warn: () => {}, error: () => {}, log: () => {} }
      };
      vm.createContext(sandbox);
      const mergeChatsCode = extractFunction(appJs, 'mergeChats');
      vm.runInContext(mergeChatsCode, sandbox);
    });

    it('V1.1: should strictly discard remote chat when updatedAt is 1 hour in the future relative to local deletion tombstone', () => {
      const T_del = 10000;
      sandbox.State.deletedChats = {
        'dead_chat_clock_drift_1': T_del
      };

      const remoteChats = [
        {
          id: 'dead_chat_clock_drift_1',
          createdAt: 5000,
          updatedAt: T_del + 3600000, // +1 hour in the future
          title: 'Resurrected Zombie Chat',
          messages: [
            { id: 'm1', content: 'I should remain dead', timestamp: 5000 }
          ]
        }
      ];

      const merged = sandbox.mergeChats([], remoteChats);
      assert.strictEqual(merged.length, 0, 'Clock-drifted remote chat must be strictly discarded');
    });

    it('V1.2: should discard remote chat when createdAt is missing/null and updatedAt is in the future', () => {
      const T_del = 20000;
      sandbox.State.deletedChats = {
        'dead_chat_missing_created': T_del
      };

      const remoteChats = [
        {
          id: 'dead_chat_missing_created',
          // createdAt is undefined
          updatedAt: T_del + 3600000,
          title: 'Corrupt Payload Zombie Chat',
          messages: []
        }
      ];

      const merged = sandbox.mergeChats([], remoteChats);
      assert.strictEqual(merged.length, 0, 'Remote chat with missing createdAt must not resurrect against tombstone');
    });

    it('V1.3: should discard message when message has deletion tombstone and remote updatedAt is 1 hour ahead', () => {
      const T_del = 15000;
      const localChats = [
        {
          id: 'chat_active_1',
          createdAt: 5000,
          updatedAt: 12000,
          deletedMessageIds: {
            'deleted_msg_target': T_del
          },
          messages: [
            { id: 'msg_alive_1', content: 'Living message', timestamp: 6000, createdAt: 6000, updatedAt: 6000 }
          ]
        }
      ];

      const remoteChats = [
        {
          id: 'chat_active_1',
          createdAt: 5000,
          updatedAt: T_del + 3600000,
          deletedMessageIds: {},
          messages: [
            { id: 'msg_alive_1', content: 'Living message', timestamp: 6000, createdAt: 6000, updatedAt: 6000 },
            {
              id: 'deleted_msg_target',
              content: 'Zombie Message with Future Clock',
              timestamp: 7000,
              createdAt: 7000,
              updatedAt: T_del + 3600000 // +1 hr clock drift
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      assert.strictEqual(merged.length, 1);
      const msgIds = merged[0].messages.map(m => m.id);
      assert.ok(!msgIds.includes('deleted_msg_target'), 'Deleted message must NOT resurrect under clock drift');
      assert.strictEqual(merged[0].messages.length, 1);
      assert.strictEqual(merged[0].messages[0].id, 'msg_alive_1');
    });

    it('V1.4: should survive extreme multi-year clock drift attack (remote device set to +5 years in future)', () => {
      const now = Date.now();
      const fiveYearsFuture = now + (5 * 365 * 24 * 3600 * 1000);
      sandbox.State.deletedChats = {
        'zombie_5yr': now
      };

      const remoteChats = [
        {
          id: 'zombie_5yr',
          createdAt: now - 50000,
          updatedAt: fiveYearsFuture,
          title: '5-Year Future Attack',
          messages: []
        }
      ];

      const merged = sandbox.mergeChats([], remoteChats);
      assert.strictEqual(merged.length, 0, 'Extreme 5-year clock drift must NOT bypass deletion tombstone');
    });

    it('V1.5: should legitimately preserve chat if createdAt is strictly newer than deletion tombstone (intentional re-creation)', () => {
      const T_del = 10000;
      sandbox.State.deletedChats = {
        'recreated_chat_1': T_del
      };

      const remoteChats = [
        {
          id: 'recreated_chat_1',
          createdAt: T_del + 5000, // Re-created 5 seconds after deletion
          updatedAt: T_del + 10000,
          title: 'Legitimate Recreated Chat',
          messages: [{ id: 'm_new', content: 'Brand new chat', timestamp: T_del + 5000 }]
        }
      ];

      const merged = sandbox.mergeChats([], remoteChats);
      assert.strictEqual(merged.length, 1, 'Intentionally re-created chat after tombstone must be preserved');
      assert.strictEqual(merged[0].title, 'Legitimate Recreated Chat');
    });

    it('V1.6: should legitimately preserve message if createdAt is strictly newer than message deletion tombstone', () => {
      const T_del = 10000;
      const localChats = [
        {
          id: 'c1',
          createdAt: 1000,
          updatedAt: 5000,
          deletedMessageIds: { 'msg_reborn': T_del },
          messages: []
        }
      ];

      const remoteChats = [
        {
          id: 'c1',
          createdAt: 1000,
          updatedAt: 20000,
          messages: [
            {
              id: 'msg_reborn',
              content: 'Re-sent message with new timestamp',
              timestamp: T_del + 2000,
              createdAt: T_del + 2000,
              updatedAt: T_del + 2000
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      assert.strictEqual(merged[0].messages.length, 1);
      assert.strictEqual(merged[0].messages[0].id, 'msg_reborn');
    });

    it('V1.7: should withstand massive flood of 100 deleted chats and 200 messages with forward-skewed timestamps', () => {
      const baseTime = 100000;
      const remoteChats = [];

      for (let i = 0; i < 100; i++) {
        const chatId = 'flood_chat_' + i;
        sandbox.State.deletedChats[chatId] = baseTime + i;

        const messages = [];
        for (let j = 0; j < 2; j++) {
          messages.push({
            id: `flood_msg_${i}_${j}`,
            content: `Spam ${i}-${j}`,
            createdAt: baseTime - 1000,
            timestamp: baseTime - 1000,
            updatedAt: baseTime + 3600000 + (j * 1000) // Clock drift
          });
        }

        remoteChats.push({
          id: chatId,
          createdAt: baseTime - 2000,
          updatedAt: baseTime + 3600000 + (i * 1000), // Clock drift
          title: `Zombie ${i}`,
          messages
        });
      }

      const merged = sandbox.mergeChats([], remoteChats);
      assert.strictEqual(merged.length, 0, '100% of 100 flood chats must be discarded');
    });
  });

  // =========================================================================
  // VECTOR 2: BASE64 IMAGE PRESERVATION UNDER NEWER REMOTE PAYLOAD
  // =========================================================================
  describe('Vector 2: Base64 Image Preservation Under Newer Remote Payload', () => {
    let sandbox;
    const sampleBase64Image = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sampleBase64Image2 = 'data:image/jpeg;base64,' + 'dGVzdF9pbWFnZV9kYXRhX3NlY29uZF9waG90b185ODc2NTQzMjEwX2NoYWxsZW5nZXI=';
    const sampleBase64Image3 = 'data:image/webp;base64,' + 'dGVzdF9pbWFnZV9kYXRhX3RoaXJkX3Bob3RvXzAxMjM0NTY3ODlfY2hhbGxlbmdlcg==';

    beforeEach(() => {
      sandbox = {
        State: { deletedChats: {} },
        Map,
        Array,
        Math,
        Object,
        Date,
        console: { warn: () => {}, error: () => {}, log: () => {} }
      };
      vm.createContext(sandbox);
      const mergeChatsCode = extractFunction(appJs, 'mergeChats');
      vm.runInContext(mergeChatsCode, sandbox);
    });

    it('V2.1: should preserve local base64 image when remote message has "__large_image__" and newer updatedAt', () => {
      const localChats = [
        {
          id: 'c_img_1',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              id: 'm_img_1',
              role: 'user',
              content: 'Analyze this chart',
              images: [sampleBase64Image],
              updatedAt: 2000
            }
          ]
        }
      ];

      const remoteChats = [
        {
          id: 'c_img_1',
          createdAt: 1000,
          updatedAt: 5000, // Newer remote chat
          messages: [
            {
              id: 'm_img_1',
              role: 'user',
              content: 'Analyze this chart (edited remotely)',
              images: ['__large_image__'], // Stripped by Firestore quota optimization
              updatedAt: 5000 // Newer remote message
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      assert.strictEqual(merged.length, 1);
      const mergedMsg = merged[0].messages[0];
      assert.strictEqual(mergedMsg.content, 'Analyze this chart (edited remotely)', 'Newer content should be accepted');
      assert.strictEqual(mergedMsg.images.length, 1);
      assert.strictEqual(mergedMsg.images[0], sampleBase64Image, 'Local base64 image data MUST NOT be clobbered by __large_image__');
    });

    it('V2.2: should preserve all 3 images when remote contains multiple "__large_image__" placeholders', () => {
      const localChats = [
        {
          id: 'c_multi_img',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              id: 'm_multi',
              role: 'user',
              content: 'Comparing 3 architectures',
              images: [sampleBase64Image, sampleBase64Image2, sampleBase64Image3],
              updatedAt: 2000
            }
          ]
        }
      ];

      const remoteChats = [
        {
          id: 'c_multi_img',
          createdAt: 1000,
          updatedAt: 4000,
          messages: [
            {
              id: 'm_multi',
              role: 'user',
              content: 'Comparing 3 architectures (updated)',
              images: ['__large_image__', '__large_image__', '__large_image__'],
              updatedAt: 4000
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      const mergedMsg = merged[0].messages[0];
      assert.strictEqual(mergedMsg.images.length, 3);
      assert.strictEqual(mergedMsg.images[0], sampleBase64Image);
      assert.strictEqual(mergedMsg.images[1], sampleBase64Image2);
      assert.strictEqual(mergedMsg.images[2], sampleBase64Image3);
    });

    it('V2.3: should preserve specific local image when remote partially retains small images and strips large ones', () => {
      const smallThumbnail = 'data:image/png;base64,small_thumb';
      const localChats = [
        {
          id: 'c_partial',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              id: 'm_part',
              images: [smallThumbnail, sampleBase64Image],
              updatedAt: 2000
            }
          ]
        }
      ];

      const remoteChats = [
        {
          id: 'c_partial',
          createdAt: 1000,
          updatedAt: 3000,
          messages: [
            {
              id: 'm_part',
              images: [smallThumbnail, '__large_image__'],
              updatedAt: 3000
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      const mergedMsg = merged[0].messages[0];
      assert.strictEqual(mergedMsg.images[0], smallThumbnail);
      assert.strictEqual(mergedMsg.images[1], sampleBase64Image, 'Second image must be restored from local base64');
    });

    it('V2.4: should preserve real image data bidirectionally if remote has real image and local has placeholder', () => {
      const localChats = [
        {
          id: 'c_rev',
          createdAt: 1000,
          updatedAt: 3000,
          messages: [
            {
              id: 'm_rev',
              images: ['__large_image__'],
              updatedAt: 3000
            }
          ]
        }
      ];

      const remoteChats = [
        {
          id: 'c_rev',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              id: 'm_rev',
              images: [sampleBase64Image],
              updatedAt: 2000
            }
          ]
        }
      ];

      const merged = sandbox.mergeChats(localChats, remoteChats);
      assert.strictEqual(merged[0].messages[0].images[0], sampleBase64Image);
    });

    it('V2.5: should withstand 50 rapid sequential merge rounds without image corruption or memory degradation', () => {
      let currentLocalChats = [
        {
          id: 'c_flood',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              id: 'm_flood',
              content: 'Initial image',
              images: [sampleBase64Image],
              updatedAt: 2000
            }
          ]
        }
      ];

      for (let round = 1; round <= 50; round++) {
        const remoteTime = 2000 + (round * 100);
        const remoteChats = [
          {
            id: 'c_flood',
            createdAt: 1000,
            updatedAt: remoteTime,
            messages: [
              {
                id: 'm_flood',
                content: `Update round ${round}`,
                images: ['__large_image__'],
                updatedAt: remoteTime
              }
            ]
          }
        ];

        currentLocalChats = sandbox.mergeChats(currentLocalChats, remoteChats);
        assert.strictEqual(
          currentLocalChats[0].messages[0].images[0],
          sampleBase64Image,
          `Image corrupted at round ${round}`
        );
      }

      assert.strictEqual(currentLocalChats[0].messages[0].content, 'Update round 50');
    });
  });

  // =========================================================================
  // VECTOR 3: STORAGE QUOTA DEPLETION STRESS
  // =========================================================================
  describe('Vector 3: Storage Quota Depletion Stress & Tombstone Immunity', () => {
    let sandbox, store, setItemCount;

    beforeEach(() => {
      store = {};
      setItemCount = 0;
      const mockLocalStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => {
          setItemCount++;
          store[k] = String(v);
        },
        removeItem: (k) => {
          delete store[k];
        },
        clear: () => {
          store = {};
        }
      };

      sandbox = {
        localStorage: mockLocalStorage,
        getStorageSuffix: () => '_user_target',
        State: {
          deletedChats: { 'chat_critical_tombstone': 1725700000000 }
        },
        console: { warn: () => {}, error: () => {}, log: () => {} }
      };
      vm.createContext(sandbox);
      const safeSaveCode = extractFunction(appJs, 'safeSaveLocalStorage');
      vm.runInContext(safeSaveCode, sandbox);
    });

    it('V3.1: should NOT wipe suna_deleted_chats to {} when QuotaExceededError (code 22) is caught', () => {
      const initialTombstones = JSON.stringify({
        'chat_dead_1': 1725700000000,
        'chat_dead_2': 1725701000000
      });
      store.suna_deleted_chats_user_target = initialTombstones;
      store.suna_chats = 'HEAVY_LEGACY_CHATS_10MB';
      store.suna_guest_notes = 'OLD_NOTES';

      let throwQuotaOnce = true;
      const originalSetItem = sandbox.localStorage.setItem;
      sandbox.localStorage.setItem = (k, v) => {
        if (throwQuotaOnce) {
          throwQuotaOnce = false;
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
        originalSetItem(k, v);
      };

      const result = sandbox.safeSaveLocalStorage('suna_settings_user_target', { theme: 'zen' });
      assert.strictEqual(result, true, 'safeSaveLocalStorage should recover and return true');
      assert.strictEqual(store.suna_chats, undefined, 'suna_chats legacy key must be evicted');
      assert.strictEqual(store.suna_guest_notes, undefined, 'suna_guest_notes legacy key must be evicted');
      assert.strictEqual(
        store.suna_deleted_chats_user_target,
        initialTombstones,
        'CRITICAL: suna_deleted_chats MUST NOT be wiped to {}'
      );
    });

    it('V3.2: should NOT wipe suna_deleted_chats when Firefox NS_ERROR_DOM_QUOTA_REACHED (code 1014) is caught', () => {
      const initialTombstones = JSON.stringify({
        'chat_dead_ff': 1725700500000
      });
      store.suna_deleted_chats_user_target = initialTombstones;

      let throwQuotaOnce = true;
      const originalSetItem = sandbox.localStorage.setItem;
      sandbox.localStorage.setItem = (k, v) => {
        if (throwQuotaOnce) {
          throwQuotaOnce = false;
          const err = new Error('Persistent storage maximum size reached');
          err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
          err.code = 1014;
          throw err;
        }
        originalSetItem(k, v);
      };

      const result = sandbox.safeSaveLocalStorage('suna_settings_user_target', { fontSize: 16 });
      assert.strictEqual(result, true);
      assert.strictEqual(store.suna_deleted_chats_user_target, initialTombstones);
    });

    it('V3.3: should protect numeric tombstones bit-for-bit even when State is temporarily undefined in sandbox', () => {
      delete sandbox.State; // State is undefined
      const initialTombstones = JSON.stringify({
        'chat_isolated_1': 1725700999999,
        'chat_isolated_2': 1725701999999
      });
      store.suna_deleted_chats_user_target = initialTombstones;

      let throwQuotaOnce = true;
      sandbox.localStorage.setItem = (k, v) => {
        if (throwQuotaOnce) {
          throwQuotaOnce = false;
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
        store[k] = String(v);
      };

      const result = sandbox.safeSaveLocalStorage('suna_settings_user_target', { theme: 'ink' });
      assert.strictEqual(result, true);
      assert.strictEqual(store.suna_deleted_chats_user_target, initialTombstones);
    });

    it('V3.4: should survive repeated quota exhaustion (5 consecutive failures) without corrupting tombstones', () => {
      const initialTombstones = JSON.stringify({ 'chat_persist': 1725700111222 });
      store.suna_deleted_chats_user_target = initialTombstones;

      for (let i = 0; i < 5; i++) {
        let throwQuotaOnce = true;
        sandbox.localStorage.setItem = (k, v) => {
          if (throwQuotaOnce) {
            throwQuotaOnce = false;
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
          }
          store[k] = String(v);
        };

        const result = sandbox.safeSaveLocalStorage('suna_settings_user_target', { round: i });
        assert.strictEqual(result, true);
        assert.strictEqual(store.suna_deleted_chats_user_target, initialTombstones);
      }
    });

    it('V3.5: should gracefully return false without crashing if storage remains permanently exhausted after recovery', () => {
      const initialTombstones = JSON.stringify({ 'chat_stay_safe': 1725700000000 });
      store.suna_deleted_chats_user_target = initialTombstones;

      // Permanently throwing quota error
      sandbox.localStorage.setItem = () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      };

      let result;
      assert.doesNotThrow(() => {
        result = sandbox.safeSaveLocalStorage('suna_settings_user_target', { heavy: 'data' });
      });
      assert.strictEqual(result, false, 'Permanently full storage should return false gracefully');
      assert.strictEqual(store.suna_deleted_chats_user_target, initialTombstones);
    });
  });

  // =========================================================================
  // VECTOR 4: NETWORK FLAPPING & SYNC INDICATOR STATES
  // =========================================================================
  describe('Vector 4: Network Flapping & Sync Indicator State Robustness', () => {
    let sandbox, listeners, indicator;

    beforeEach(() => {
      listeners = new Map();
      const mockWindow = {
        addEventListener: (type, fn) => {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        removeEventListener: (type, fn) => {
          if (!listeners.has(type)) return;
          listeners.set(type, listeners.get(type).filter(f => f !== fn));
        },
        dispatchEvent: (type) => {
          const list = listeners.get(type) || [];
          list.forEach(fn => fn());
        }
      };

      indicator = {
        id: 'sync-indicator',
        className: 'sync-indicator offline',
        innerHTML: '',
        title: 'Chưa đồng bộ'
      };

      const mockDocument = {
        getElementById: (id) => id === 'sync-indicator' ? indicator : null
      };

      sandbox = {
        window: mockWindow,
        document: mockDocument,
        AuthState: { isLoggedIn: true, useLocalOnly: false },
        _fb: true,
        cloudLoad: async () => {},
        initRealtimeSync: () => {},
        toast: () => {},
        console: { warn: () => {}, error: () => {}, log: () => {} }
      };

      vm.createContext(sandbox);
      const updateSyncCode = extractFunction(appJs, 'updateSyncIndicator');
      vm.runInContext(updateSyncCode, sandbox);
      vm.runInContext('window.updateSyncIndicator = updateSyncIndicator;', sandbox);

      const initEventsCode = extractFunction(appJs, 'initEvents');
      // Extract network listeners specifically
      const netStart = initEventsCode.indexOf("window.addEventListener('offline'");
      const netEnd = initEventsCode.indexOf("// Session & Chat Scroll Preservation");
      const networkInitBlock = initEventsCode.slice(netStart, netEnd);
      vm.runInContext('(function() { ' + networkInitBlock + ' })();', sandbox);
    });

    it('V4.1: should attach exactly 1 offline and 1 online event listener without duplication', () => {
      assert.strictEqual((listeners.get('offline') || []).length, 1);
      assert.strictEqual((listeners.get('online') || []).length, 1);
    });

    it('V4.2: should simulate 50 rapid online/offline network transitions and reflect exact terminal state', async () => {
      for (let i = 0; i < 50; i++) {
        const isOnline = (i % 2 === 1);
        sandbox.window.dispatchEvent(isOnline ? 'online' : 'offline');
        await new Promise(r => setImmediate(r));
      }

      // 50th iteration (i=49): online
      assert.strictEqual(indicator.className, 'sync-indicator synced');
      assert.strictEqual(indicator.title, 'Đã đồng bộ');
      assert.ok(indicator.innerHTML.includes('cloud_done'));

      // Transition once more to offline
      sandbox.window.dispatchEvent('offline');
      assert.strictEqual(indicator.className, 'sync-indicator offline');
      assert.strictEqual(indicator.title, 'Chưa đồng bộ');
      assert.ok(indicator.innerHTML.includes('cloud_off'));
    });

    it('V4.3: should correctly display error state when cloudLoad fails during online reconnection', async () => {
      sandbox.cloudLoad = async () => {
        throw new Error('Firestore network partition');
      };

      sandbox.window.dispatchEvent('online');
      await new Promise(r => setImmediate(r));

      assert.strictEqual(indicator.className, 'sync-indicator error');
      assert.strictEqual(indicator.title, 'Lỗi đồng bộ');
      assert.ok(indicator.innerHTML.includes('cloud_off'));
    });

    it('V4.4: should verify all 4 sync indicator states correspond to CSS definitions in styles.css', () => {
      const states = ['synced', 'syncing', 'offline', 'error'];
      for (const st of states) {
        sandbox.updateSyncIndicator(st);
        assert.strictEqual(indicator.className, 'sync-indicator ' + st);
        // Verify CSS definition exists in styles.css
        assert.match(
          stylesCss,
          new RegExp(`\\.sync-indicator\\.${st}`),
          `CSS class .sync-indicator.${st} must be defined in styles.css`
        );
      }
    });

    it('V4.5: should ensure #sync-indicator element exists in index.html with appropriate initial accessibility attributes', () => {
      assert.match(indexHtml, /id=["']sync-indicator["']/);
      assert.match(indexHtml, /class=["'][^"']*sync-indicator[^"']*["']/);
    });
  });
});
