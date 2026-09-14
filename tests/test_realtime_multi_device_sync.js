/**
 * tests/test_realtime_multi_device_sync.js
 * 
 * Dedicated Automated Test Suite for:
 * Realtime Multi-Device Two-Way Sync, Sub-Second Latency, Continuous Sync Queue,
 * BroadcastChannel Tab Sync, and Storage Conflict Prevention.
 * 
 * Spec Reference:
 * - Requirements R1, R2, R3
 * - Acceptance Criteria: Realtime Multi-Device Sync & Latency
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Suna Chat: Realtime Multi-Device Two-Way Sync & Latency Test Suite', function() {
  this.timeout(10000);

  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // SIMULATED MULTI-DEVICE FIRESTORE BACKEND
  // =========================================================================

  function createSimulatedCloudBackend() {
    const documents = new Map();
    const listeners = new Map();
    let getDocCount = 0;
    let setDocCount = 0;

    return {
      get getDocCount() { return getDocCount; },
      get setDocCount() { return setDocCount; },
      resetCounters() { getDocCount = 0; setDocCount = 0; },

      createSession(sessionId) {
        return {
          db: {},
          doc(_db, ...parts) {
            return parts.join('/');
          },
          serverTimestamp() {
            return Date.now();
          },
          async getDoc(docPath) {
            getDocCount++;
            const data = documents.get(docPath);
            return {
              exists: () => data !== undefined,
              data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : null),
              metadata: { hasPendingWrites: false }
            };
          },
          async setDoc(docPath, data) {
            setDocCount++;
            const copy = JSON.parse(JSON.stringify(data));
            documents.set(docPath, copy);
            const cbs = listeners.get(docPath);
            if (cbs) {
              for (const cb of cbs) {
                try {
                  cb({
                    exists: () => true,
                    data: () => JSON.parse(JSON.stringify(copy)),
                    metadata: { hasPendingWrites: false }
                  });
                } catch (err) {}
              }
            }
          },
          onSnapshot(docPath, onNext, _onError) {
            if (!listeners.has(docPath)) {
              listeners.set(docPath, new Set());
            }
            listeners.get(docPath).add(onNext);
            const data = documents.get(docPath);
            if (data !== undefined) {
              Promise.resolve().then(() => {
                onNext({
                  exists: () => true,
                  data: () => JSON.parse(JSON.stringify(data)),
                  metadata: { hasPendingWrites: false }
                });
              });
            }
            return () => {
              const set = listeners.get(docPath);
              if (set) set.delete(onNext);
            };
          }
        };
      }
    };
  }

  // =========================================================================
  // SIMULATED BROWSER SESSION HARNESS
  // =========================================================================

  function createSimulatedSession(sessionName, cloudBackend, sharedBroadcastBus = null) {
    const localStorageStore = new Map();
    const idbStore = new Map();
    const fbSession = cloudBackend.createSession(sessionName);

    const docListeners = new Map();
    const mockElements = new Map();

    function getOrCreateEl(id) {
      if (!mockElements.has(id)) {
        mockElements.set(id, {
          id,
          value: '',
          textContent: '',
          innerHTML: '',
          style: {
            setProperty: () => {},
            removeProperty: () => {}
          },
          setAttribute: () => {},
          getAttribute: () => null,
          removeAttribute: () => {},
          remove: () => {},
          classList: {
            add: () => {},
            remove: () => {},
            contains: () => false,
            toggle: () => {}
          },
          addEventListener: () => {},
          click: () => {},
          focus: () => {},
          select: () => {},
          appendChild: () => {},
          querySelectorAll: () => [],
          querySelector: () => null,
          closest: () => null
        });
      }
      return mockElements.get(id);
    }

    const mockDocument = {
      body: getOrCreateEl('body'),
      documentElement: getOrCreateEl('html'),
      createElement: (tag) => getOrCreateEl('tag-' + tag + '-' + Math.random().toString(36).substring(2)),
      getElementById: (id) => getOrCreateEl(id),
      querySelector: (sel) => {
        if (sel === 'body') return getOrCreateEl('body');
        if (sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
        return getOrCreateEl('mock-' + sel);
      },
      querySelectorAll: () => [],
      addEventListener: (evt, fn) => {
        if (!docListeners.has(evt)) docListeners.set(evt, []);
        docListeners.get(evt).push(fn);
      },
      removeEventListener: () => {},
      dispatchEvent: (evt) => {
        const type = evt.type || evt;
        const list = docListeners.get(type) || [];
        for (const fn of list) fn(evt);
        return true;
      },
      visibilityState: 'visible'
    };

    class MockBroadcastChannel {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
        if (sharedBroadcastBus) {
          sharedBroadcastBus.subscribe(this);
        }
      }
      postMessage(msg) {
        if (sharedBroadcastBus) {
          sharedBroadcastBus.publish(this, msg);
        }
      }
      close() {
        if (sharedBroadcastBus) {
          sharedBroadcastBus.unsubscribe(this);
        }
      }
    }

    class MockAudio {
      constructor() {
        this.src = '';
        this.volume = 1;
        this.loop = false;
        this.paused = true;
      }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
      addEventListener() {}
      removeEventListener() {}
    }
    class MockObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const winListeners = new Map();
    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: (cb) => { if (typeof cb === 'function') return setTimeout(cb, 0); },
      cancelAnimationFrame: (id) => clearTimeout(id),
      Promise,
      Date,
      Math,
      JSON,
      Map,
      Set,
      Array,
      Object,
      TextDecoder,
      AbortController,
      Audio: MockAudio,
      IntersectionObserver: MockObserver,
      MutationObserver: MockObserver,
      ResizeObserver: MockObserver,
      BroadcastChannel: MockBroadcastChannel,
      document: mockDocument,
      addEventListener: (t, fn) => {
        if (!winListeners.has(t)) winListeners.set(t, []);
        winListeners.get(t).push(fn);
      },
      removeEventListener: (t, fn) => {
        if (!winListeners.has(t)) return;
        winListeners.set(t, winListeners.get(t).filter(h => h !== fn));
      },
      dispatchEvent: (evt) => {
        const type = evt.type || evt;
        const list = winListeners.get(type) || [];
        for (const fn of list) fn(evt);
        return true;
      },
      $: (sel) => mockDocument.querySelector(sel),
      $$: (sel) => mockDocument.querySelectorAll(sel),
      window: {},
      navigator: { onLine: true },
      localStorage: {
        getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
        setItem: (k, v) => localStorageStore.set(k, String(v)),
        removeItem: (k) => localStorageStore.delete(k),
        clear: () => localStorageStore.clear()
      },
      idbGet: async (k) => (idbStore.has(k) ? JSON.parse(JSON.stringify(idbStore.get(k))) : null),
      idbSet: async (k, v) => { idbStore.set(k, JSON.parse(JSON.stringify(v))); },
      idbDelete: async (k) => { idbStore.delete(k); },
      toast: () => {},
      _mockFb: fbSession
    };

    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(appJs, sandbox);
    vm.runInContext('_fb = _mockFb; window._fb = _mockFb;', sandbox);
    sandbox.idbSet = async (k, v) => { idbStore.set(k, JSON.parse(JSON.stringify(v))); };
    sandbox.idbGet = async (k) => (idbStore.has(k) ? JSON.parse(JSON.stringify(idbStore.get(k))) : null);
    sandbox.idbDelete = async (k) => { idbStore.delete(k); };

    return {
      sandbox,
      fbSession,
      idbStore,
      localStorageStore
    };
  }

  // =========================================================================
  // TESTS
  // =========================================================================

  describe('1. Two-Way Instant Realtime Sync Between Two Devices (R1)', () => {
    it('should reflect a new message created on Device A onto Device B in real-time without manual refresh', async () => {
      const cloud = createSimulatedCloudBackend();
      const testUid = 'user_google_123';

      const devA = createSimulatedSession('device_A', cloud);
      const devB = createSimulatedSession('device_B', cloud);

      devA.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.initRealtimeSync();

      devB.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;
      devB.sandbox.initRealtimeSync();

      const chatA = devA.sandbox.createChat();
      chatA.title = 'Thảo luận kiến trúc';
      chatA.messages.push({
        id: 'msg-001',
        role: 'user',
        content: 'Xin chào từ Device A',
        timestamp: Date.now(),
        updatedAt: Date.now()
      });
      chatA.updatedAt = Date.now();

      await devA.sandbox.cloudSave(true);

      const chatOnB = devB.sandbox.State.chats.find(c => c.id === chatA.id);
      assert.ok(chatOnB, 'Device B must have the newly created chat from Device A');
      assert.strictEqual(chatOnB.title, 'Thảo luận kiến trúc');
      assert.strictEqual(chatOnB.messages.length, 1);
      assert.strictEqual(chatOnB.messages[0].content, 'Xin chào từ Device A');
    });

    it('should reflect AI assistant response completed on Device A onto Device B in real-time', async () => {
      const cloud = createSimulatedCloudBackend();
      const testUid = 'user_google_123';

      const devA = createSimulatedSession('device_A', cloud);
      const devB = createSimulatedSession('device_B', cloud);

      devA.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.initRealtimeSync();

      devB.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;
      devB.sandbox.initRealtimeSync();

      const chatId = 'shared-chat-100';
      devA.sandbox.State.chats = [{
        id: chatId,
        title: 'Hỏi đáp AI',
        messages: [{ id: 'm1', role: 'user', content: '1+1=?', timestamp: 1000, updatedAt: 1000 }],
        createdAt: 1000,
        updatedAt: 1000
      }];
      await devA.sandbox.cloudSave(true);

      const chatOnA = devA.sandbox.State.chats.find(c => c.id === chatId);
      chatOnA.messages.push({
        id: 'm2',
        role: 'assistant',
        content: '1 + 1 = 2',
        timestamp: 2000,
        updatedAt: 2000
      });
      chatOnA.updatedAt = 2000;
      await devA.sandbox.cloudSave(true);

      const chatOnB = devB.sandbox.State.chats.find(c => c.id === chatId);
      assert.ok(chatOnB);
      assert.strictEqual(chatOnB.messages.length, 2);
      assert.strictEqual(chatOnB.messages[1].role, 'assistant');
      assert.strictEqual(chatOnB.messages[1].content, '1 + 1 = 2');
    });

    it('should reflect chat deletion on Device A onto Device B immediately with no zombie resurrection', async () => {
      const cloud = createSimulatedCloudBackend();
      const testUid = 'user_google_123';

      const devA = createSimulatedSession('device_A', cloud);
      const devB = createSimulatedSession('device_B', cloud);

      devA.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.initRealtimeSync();

      devB.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;
      devB.sandbox.initRealtimeSync();

      devA.sandbox.State.chats = [
        { id: 'chat_to_delete', title: 'Chat cần xóa', messages: [], createdAt: 1000, updatedAt: 1000 },
        { id: 'chat_to_keep', title: 'Chat giữ lại', messages: [], createdAt: 2000, updatedAt: 2000 }
      ];
      await devA.sandbox.cloudSave(true);

      assert.strictEqual(devB.sandbox.State.chats.length, 2);

      devA.sandbox.deleteChat('chat_to_delete');
      await devA.sandbox.cloudSave(true);

      assert.strictEqual(devB.sandbox.State.chats.length, 1);
      assert.strictEqual(devB.sandbox.State.chats[0].id, 'chat_to_keep');
      assert.ok(devB.sandbox.State.deletedChats['chat_to_delete'], 'Tombstone must be propagated to Device B');
    });

    it('should reflect memory and settings modifications on Device A onto Device B in real-time', async () => {
      const cloud = createSimulatedCloudBackend();
      const testUid = 'user_google_123';

      const devA = createSimulatedSession('device_A', cloud);
      const devB = createSimulatedSession('device_B', cloud);

      devA.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.initRealtimeSync();

      devB.sandbox.AuthState.user = { uid: testUid, email: 'tester@gmail.com' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;
      devB.sandbox.initRealtimeSync();

      devA.sandbox.addMemoryFact('Người dùng thích lập trình Node.js', 'preference');
      await devA.sandbox.cloudSave(true);

      const hasFact = devB.sandbox.State.memory.facts.some(f => f.fact.includes('Node.js'));
      assert.ok(hasFact, 'Device B must receive memory fact update from Device A');

      devA.sandbox.State.settings.theme = 'zen';
      devA.sandbox.State.settings.updatedAt = Date.now();
      await devA.sandbox.cloudSave(true);

      assert.strictEqual(devB.sandbox.State.settings.theme, 'zen', 'Device B must receive settings update from Device A');
    });
  });

  describe('2. Sub-Second Latency & Debounce Optimization (R2)', () => {
    it('should complete cloud sync in < 500ms when push is immediate (latency benchmark)', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_latency', cloud);

      dev.sandbox.AuthState.user = { uid: 'latency_uid', email: 'user@test.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;
      dev.sandbox.initRealtimeSync();

      const startTime = Date.now();
      dev.sandbox.createChat();
      await dev.sandbox.cloudSave(true);
      const elapsedMs = Date.now() - startTime;

      assert.ok(elapsedMs < 500, `Cloud save immediate should be ultra-fast (<500ms), actual: ${elapsedMs}ms`);
    });

    it('should use ultra-short debounce (~150ms) for background saves instead of legacy 2000ms delay', (done) => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_debounce', cloud);

      dev.sandbox.AuthState.user = { uid: 'debounce_uid', email: 'user@test.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;

      const startTime = Date.now();
      dev.sandbox.cloudSave(false);

      setTimeout(() => {
        const elapsed = Date.now() - startTime;
        assert.ok(elapsed < 400, 'Debounce should fire quickly');
        assert.strictEqual(cloud.setDocCount >= 1, true, 'Sync should have triggered within ~150-250ms');
        done();
      }, 250);
    });
  });

  describe('3. Continuous Sync Queue (_hasPendingSync) & Zero Data Drops (R2)', () => {
    it('should never drop rapid consecutive updates even when calls happen while sync is in-flight', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_queue', cloud);

      dev.sandbox.AuthState.user = { uid: 'queue_uid', email: 'user@test.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;

      const p1 = dev.sandbox.cloudSave(true);

      dev.sandbox.State.chats = [
        { id: 'chat_burst_1', title: 'Burst 1', messages: [], createdAt: 1, updatedAt: 1 }
      ];
      dev.sandbox.cloudSave(true);

      dev.sandbox.State.chats.push(
        { id: 'chat_burst_2', title: 'Burst 2', messages: [], createdAt: 2, updatedAt: 2 }
      );
      dev.sandbox.cloudSave(true);

      await p1;
      await new Promise(r => setTimeout(r, 100));

      const cSnap = await dev.fbSession.getDoc('users/queue_uid/data/chats');
      assert.ok(cSnap.exists());
      const cloudChats = JSON.parse(cSnap.data().chats);

      assert.strictEqual(cloudChats.length, 2, 'Continuous sync queue must flush all bursts without drop');
      assert.ok(cloudChats.find(c => c.id === 'chat_burst_1'));
      assert.ok(cloudChats.find(c => c.id === 'chat_burst_2'));
    });
  });

  describe('4. Zero-Latency Inter-Tab Sync via BroadcastChannel (R2)', () => {
    it('should synchronize updates across tabs on the same device with 0ms delay via BroadcastChannel', () => {
      const subscribers = new Set();
      const bus = {
        subscribe: (ch) => subscribers.add(ch),
        unsubscribe: (ch) => subscribers.delete(ch),
        publish: (sender, msg) => {
          for (const ch of subscribers) {
            if (ch !== sender && ch.onmessage) {
              ch.onmessage({ data: JSON.parse(JSON.stringify(msg)) });
            }
          }
        }
      };

      const cloud = createSimulatedCloudBackend();
      const tab1 = createSimulatedSession('tab1', cloud, bus);
      const tab2 = createSimulatedSession('tab2', cloud, bus);

      const uid = 'user_multi_tab';
      tab1.sandbox.AuthState.user = { uid, email: 'tab@suna.local' };
      tab1.sandbox.AuthState.isLoggedIn = true;
      tab2.sandbox.AuthState.user = { uid, email: 'tab@suna.local' };
      tab2.sandbox.AuthState.isLoggedIn = true;

      const chat = tab1.sandbox.createChat();
      chat.title = 'Tin nhắn tức thì giữa các Tab';
      tab1.sandbox.saveState(true);

      const chatOnTab2 = tab2.sandbox.State.chats.find(c => c.id === chat.id);
      assert.ok(chatOnTab2, 'Tab 2 should immediately receive chat created in Tab 1 via BroadcastChannel');
      assert.strictEqual(chatOnTab2.title, 'Tin nhắn tức thì giữa các Tab');
    });
  });

  describe('5. Storage Bottleneck & State Conflict Resolution (R3)', () => {
    it('should ensure user message is saved to IndexedDB and pushed to Cloud even when State.isGenerating === true', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_gen_sync', cloud);

      dev.sandbox.AuthState.user = { uid: 'user_gen', email: 'gen@suna.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;

      const chat = dev.sandbox.createChat();
      dev.sandbox.State.isGenerating = true;

      chat.messages.push({
        id: 'msg_user_prompt',
        role: 'user',
        content: 'Hãy trả lời câu hỏi này',
        timestamp: Date.now(),
        updatedAt: Date.now()
      });
      await dev.sandbox.saveState(true);

      const suffix = dev.sandbox.getStorageSuffix();
      const idbChats = await dev.sandbox.idbGet('suna_chats' + suffix);
      assert.ok(idbChats, 'IndexedDB must contain chats even when isGenerating is true');
      const savedChat = idbChats.find(c => c.id === chat.id);
      assert.ok(savedChat && savedChat.messages.length > 0, 'User message must be preserved in IndexedDB');
    });

    it('should eliminate redundant 3 getDoc calls on subsequent cloudSave by utilizing warmed snapshots', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_warmed', cloud);

      dev.sandbox.AuthState.user = { uid: 'warmed_uid', email: 'warmed@test.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;
      dev.sandbox.initRealtimeSync();

      cloud.resetCounters();
      await dev.sandbox.cloudSave(true);
      const initialGetDocs = cloud.getDocCount;
      assert.strictEqual(initialGetDocs, 3, 'First save should query remote docs for pre-merge');

      cloud.resetCounters();
      dev.sandbox.createChat();
      await dev.sandbox.cloudSave(true);
      const subsequentGetDocs = cloud.getDocCount;

      assert.strictEqual(subsequentGetDocs, 0, 'Subsequent saves must use warmed snapshots and avoid 3 redundant getDoc RTTs');
    });
  });

  describe('6. Adversarial Multi-Device Hardening & Targeted Writes (Reviewer Hardening)', () => {
    it('should perform targeted writes (write only chats doc) when only chats are updated, reducing RTT and quota', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_targeted', cloud);

      dev.sandbox.AuthState.user = { uid: 'targeted_uid', email: 'user@test.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;
      dev.sandbox.initRealtimeSync();

      // Initial save to warm all 3
      await dev.sandbox.cloudSave(true);

      cloud.resetCounters();
      dev.sandbox.createChat();
      await dev.sandbox.cloudSave(true);

      assert.strictEqual(cloud.setDocCount, 1, 'Subsequent chat save should only write chats document (targeted write)');
      assert.strictEqual(cloud.getDocCount, 0, 'Warmed chats save should require 0 getDoc queries');
    });

    it('should prevent Device B settings from being reverted when Device A sends a chat message', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'shared_settings_uid';

      const devA = createSimulatedSession('dev_A_settings', cloud);
      const devB = createSimulatedSession('dev_B_settings', cloud);

      devA.sandbox.AuthState.user = { uid, email: 'shared@suna.local' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;

      devB.sandbox.AuthState.user = { uid, email: 'shared@suna.local' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;

      // Seed initial cloud state
      await devA.sandbox.cloudSave(true);
      devA.sandbox.initRealtimeSync();
      devB.sandbox.initRealtimeSync();
      await new Promise(r => setTimeout(r, 20));

      // Device B updates settings to 'zen' with fontSize 18
      devB.sandbox.State.settings.theme = 'zen';
      devB.sandbox.State.settings.fontSize = 18;
      devB.sandbox.State.settings.updatedAt = Date.now();
      await devB.sandbox.cloudSave(true);

      assert.strictEqual(devA.sandbox.State.settings.theme, 'zen', 'Device A should receive theme zen');

      // Device B now sets fontSize = 20 locally
      devB.sandbox.State.settings.fontSize = 20;
      devB.sandbox.State.settings.updatedAt = Date.now() + 500;

      // Device A sends a chat message (Device A did NOT modify settings)
      const chatA = devA.sandbox.createChat();
      chatA.messages.push({ id: 'msg_targeted', role: 'user', content: 'test targeted write', timestamp: Date.now(), updatedAt: Date.now() });
      await devA.sandbox.cloudSave(true);

      // Verify Device B's local fontSize was not reverted by Device A's chat write
      assert.strictEqual(devB.sandbox.State.settings.fontSize, 20, 'Device B fontSize MUST NOT be reverted by Device A chat write');
    });

    it('should preserve remote cloud chats even if cloudSave runs when only settings snapshot has been warmed', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'partial_warm_uid';

      const devPre = createSimulatedSession('dev_pre', cloud);
      devPre.sandbox.AuthState.user = { uid, email: 'partial@test.local' };
      devPre.sandbox.AuthState.isLoggedIn = true;
      devPre.sandbox.State.chats = [
        { id: 'chat_existing_on_cloud', title: 'Existing Cloud Chat', messages: [], createdAt: 1000, updatedAt: 1000 }
      ];
      await devPre.sandbox.cloudSave(true);

      // Device 2 starts up
      const dev2 = createSimulatedSession('dev_2_partial', cloud);
      dev2.sandbox.AuthState.user = { uid, email: 'partial@test.local' };
      dev2.sandbox.AuthState.isLoggedIn = true;

      // Simulate partial warming: ONLY settings is warmed
      dev2.sandbox._warmedSnapshots = {
        uid,
        settings: { theme: 'zen', updatedAt: 1000 },
        chats: null,
        memory: null,
        warmed: {
          settings: true,
          chats: false,
          memory: false
        }
      };

      // Device 2 creates a new local chat and saves
      dev2.sandbox.State.chats = [
        { id: 'chat_dev2_new', title: 'Device 2 New', messages: [], createdAt: 2000, updatedAt: 2000 }
      ];
      await dev2.sandbox.cloudSave(true);

      const cSnap = await dev2.fbSession.getDoc('users/' + uid + '/data/chats');
      assert.ok(cSnap.exists());
      const cloudChats = JSON.parse(cSnap.data().chats);

      assert.ok(cloudChats.find(c => c.id === 'chat_existing_on_cloud'), 'Existing cloud chat must NOT be wiped out by partial warming');
      assert.ok(cloudChats.find(c => c.id === 'chat_dev2_new'), 'Device 2 new chat must be merged into cloud chats');
    });

    it('should enforce strict BroadcastChannel account isolation preventing cross-account and guest leaks', () => {
      const subscribers = new Set();
      const bus = {
        subscribe: (ch) => subscribers.add(ch),
        unsubscribe: (ch) => subscribers.delete(ch),
        publish: (sender, msg) => {
          for (const ch of subscribers) {
            if (ch !== sender && ch.onmessage) {
              ch.onmessage({ data: JSON.parse(JSON.stringify(msg)) });
            }
          }
        }
      };

      const cloud = createSimulatedCloudBackend();
      const tabUserA = createSimulatedSession('tab_user_a', cloud, bus);
      const tabGuest = createSimulatedSession('tab_guest', cloud, bus);
      const tabUserB = createSimulatedSession('tab_user_b', cloud, bus);

      tabUserA.sandbox.AuthState.user = { uid: 'user_alice', email: 'alice@suna.local' };
      tabUserA.sandbox.AuthState.isLoggedIn = true;

      tabGuest.sandbox.AuthState.user = null;
      tabGuest.sandbox.AuthState.isLoggedIn = false;
      tabGuest.sandbox.State.chats = [{ id: 'guest_chat_0', title: 'Guest Chat', messages: [] }];

      tabUserB.sandbox.AuthState.user = { uid: 'user_bob', email: 'bob@suna.local' };
      tabUserB.sandbox.AuthState.isLoggedIn = true;
      tabUserB.sandbox.State.chats = [{ id: 'bob_chat_0', title: 'Bob Chat', messages: [] }];

      // Alice creates a private chat and broadcasts
      const aliceChat = tabUserA.sandbox.createChat();
      aliceChat.title = 'Alice Top Secret';
      tabUserA.sandbox.saveState(true);

      // Guest tab must NOT receive Alice's chat
      assert.strictEqual(
        tabGuest.sandbox.State.chats.find(c => c.id === aliceChat.id),
        undefined,
        'Guest tab must NOT receive chats from logged-in Alice'
      );

      // Bob's tab must NOT receive Alice's chat
      assert.strictEqual(
        tabUserB.sandbox.State.chats.find(c => c.id === aliceChat.id),
        undefined,
        'Bob tab must NOT receive chats from logged-in Alice'
      );
    });

    it('should correctly normalize and compare Firestore Timestamp objects in mergeSettings and mergeChats', () => {
      const dev = createSimulatedSession('dev_norm', createSimulatedCloudBackend());

      // Firestore Timestamp object mock
      const firestoreTimestamp = {
        seconds: 1726000000,
        nanoseconds: 500000000,
        toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
      };

      const localSettings = { theme: 'aurora', updatedAt: 1725000000000 };
      const remoteSettings = { theme: 'zen', updatedAt: firestoreTimestamp };

      const mergedSettings = dev.sandbox.mergeSettings(localSettings, remoteSettings);
      assert.strictEqual(mergedSettings.theme, 'zen', 'Remote Firestore Timestamp should win when newer');
      assert.strictEqual(typeof mergedSettings.updatedAt, 'number', 'Merged updatedAt should be normalized to number');

      const localChats = [{ id: 'c1', title: 'Old Title', updatedAt: 1725000000000, messages: [] }];
      const remoteChats = [{ id: 'c1', title: 'New Title', updatedAt: firestoreTimestamp, messages: [] }];

      const mergedChats = dev.sandbox.mergeChats(localChats, remoteChats);
      assert.strictEqual(mergedChats[0].title, 'New Title', 'Remote chat with Firestore Timestamp should win title');
    });

    it('should not overwrite cloud settings with default settings when a fresh device boots up', () => {
      const dev = createSimulatedSession('dev_fresh_boot', createSimulatedCloudBackend());

      // Fresh device has default settings
      dev.sandbox.clearInMemoryState();
      assert.strictEqual(dev.sandbox.State.settings.updatedAt, 0, 'Default settings must have updatedAt: 0');

      // Cloud settings were saved earlier with real user preferences
      const cloudSettings = {
        theme: 'zen',
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: 18,
        updatedAt: 1726000000000
      };

      const merged = dev.sandbox.mergeSettings(dev.sandbox.State.settings, cloudSettings);
      assert.strictEqual(merged.theme, 'zen', 'Cloud settings must win over default boot settings');
      assert.strictEqual(merged.fontSize, 18, 'Cloud fontSize must win over default boot settings');
    });
  });

  describe('7. Adversarial Cross-Device Stress & Concurrent Typing Hardening (Round 2 Hardening)', () => {
    it('7.1: should preserve and sync folder, pinnedContext, and chat metadata across devices without dropping metadata', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'meta_sync_uid';
      const devA = createSimulatedSession('dev_A_meta', cloud);
      const devB = createSimulatedSession('dev_B_meta', cloud);

      devA.sandbox.AuthState.user = { uid, email: 'meta@suna.local' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.initRealtimeSync();

      devB.sandbox.AuthState.user = { uid, email: 'meta@suna.local' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;
      devB.sandbox.initRealtimeSync();

      const chatA = devA.sandbox.createChat();
      chatA.title = 'Phân tích tài chính';
      await devA.sandbox.cloudSave(true);

      // Verify devB received the chat
      assert.strictEqual(devB.sandbox.State.chats.length, 1);
      const chatB = devB.sandbox.State.chats[0];

      // Device A assigns folder and pinned context
      await devA.sandbox.setChatFolder(chatA.id, 'Công việc');
      devA.sandbox.State.activeChatId = chatA.id;
      const pinnedInput = devA.sandbox.document.getElementById('pinned-context-input');
      pinnedInput.value = 'Chỉ dẫn ưu tiên: tập trung vào tỷ suất ROI';
      await devA.sandbox.savePinnedContext();

      // Ensure devB receives the folder and pinnedContext in real-time
      const updatedOnB = devB.sandbox.State.chats.find(c => c.id === chatA.id);
      assert.ok(updatedOnB, 'Device B must have the chat');
      assert.strictEqual(updatedOnB.folder, 'Công việc', 'Device B must receive the folder update');
      assert.strictEqual(updatedOnB.pinnedContext, 'Chỉ dẫn ưu tiên: tập trung vào tỷ suất ROI', 'Device B must receive the pinnedContext update');
    });

    it('7.2: should reconcile and push merged messages to cloud when two devices send messages concurrently within propagation window', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'concurrent_typing_uid';
      const devA = createSimulatedSession('dev_A_conc', cloud);
      const devB = createSimulatedSession('dev_B_conc', cloud);

      devA.sandbox.AuthState.user = { uid, email: 'conc@suna.local' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;

      devB.sandbox.AuthState.user = { uid, email: 'conc@suna.local' };
      devB.sandbox.AuthState.isLoggedIn = true;
      devB.sandbox.AuthState.useLocalOnly = false;

      // Seed common chat
      const chatId = 'shared_race_chat';
      devA.sandbox.State.chats = [{
        id: chatId,
        title: 'Concurrent Chat',
        messages: [{ id: 'm0', role: 'user', content: 'Base message', timestamp: 1000, updatedAt: 1000 }],
        createdAt: 1000,
        updatedAt: 1000
      }];
      await devA.sandbox.cloudSave(true);

      devA.sandbox.initRealtimeSync();
      devB.sandbox.initRealtimeSync();
      await devB.sandbox.cloudLoad();

      // Device A adds message A and saves
      const chatOnA = devA.sandbox.State.chats.find(c => c.id === chatId);
      chatOnA.messages.push({ id: 'msgA', role: 'user', content: 'Message from Dev A', timestamp: 2000, updatedAt: 2000 });
      chatOnA.updatedAt = 2000;
      const pA = devA.sandbox.cloudSave(true);

      // Concurrently before snapshot propagates, Device B adds message B and saves
      const chatOnB = devB.sandbox.State.chats.find(c => c.id === chatId);
      chatOnB.messages.push({ id: 'msgB', role: 'user', content: 'Message from Dev B', timestamp: 2001, updatedAt: 2001 });
      chatOnB.updatedAt = 2001;
      const pB = devB.sandbox.cloudSave(true);

      await Promise.all([pA, pB]);
      // Give reconciliation loop a moment to propagate
      await new Promise(r => setTimeout(r, 100));

      // Verify Cloud contains both messages
      const cSnap = await devA.fbSession.getDoc(`users/${uid}/data/chats`);
      assert.ok(cSnap.exists());
      const cloudChats = JSON.parse(cSnap.data().chats);
      const targetCloudChat = cloudChats.find(c => c.id === chatId);
      assert.ok(targetCloudChat, 'Chat must exist in cloud');

      const cloudMsgIds = targetCloudChat.messages.map(m => m.id);
      assert.ok(cloudMsgIds.includes('msgA'), 'Cloud must preserve message from Device A');
      assert.ok(cloudMsgIds.includes('msgB'), 'Cloud must preserve message from Device B');
      assert.strictEqual(targetCloudChat.messages.length, 3, 'Cloud must reconcile all 3 messages without drop');

      // Both devices must also have all 3 messages
      const finalA = devA.sandbox.State.chats.find(c => c.id === chatId).messages.map(m => m.id);
      const finalB = devB.sandbox.State.chats.find(c => c.id === chatId).messages.map(m => m.id);
      assert.ok(finalA.includes('msgA') && finalA.includes('msgB'), 'Device A must have both concurrent messages');
      assert.ok(finalB.includes('msgA') && finalB.includes('msgB'), 'Device B must have both concurrent messages');
    });

    it('7.3: should reconcile offline-created chats and push to cloud upon establishing realtime sync', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'offline_recon_uid';

      // Cloud already has a chat created from Device B
      const fbDirect = cloud.createSession('cloud_direct');
      await fbDirect.setDoc(`users/${uid}/data/chats`, {
        chats: JSON.stringify([{
          id: 'cloud_chat_existing',
          title: 'Remote Chat',
          messages: [{ id: 'rm1', role: 'user', content: 'Remote message', timestamp: 1000, updatedAt: 1000 }],
          createdAt: 1000,
          updatedAt: 1000
        }]),
        deletedChats: '{}',
        updatedAt: 1000
      });

      // Device A boots with offline-created chat
      const devA = createSimulatedSession('dev_A_offline', cloud);
      devA.sandbox.AuthState.user = { uid, email: 'offline@suna.local' };
      devA.sandbox.AuthState.isLoggedIn = true;
      devA.sandbox.AuthState.useLocalOnly = false;
      devA.sandbox.State.chats = [{
        id: 'local_offline_chat',
        title: 'Offline Chat',
        messages: [{ id: 'lm1', role: 'user', content: 'Offline message', timestamp: 2000, updatedAt: 2000 }],
        createdAt: 2000,
        updatedAt: 2000
      }];

      // Device A performs cloudLoad to reconcile
      const loadSuccess = await devA.sandbox.cloudLoad();
      assert.strictEqual(loadSuccess, true, 'cloudLoad must succeed and reconcile');
      devA.sandbox.initRealtimeSync();

      // Verify devA has both chats
      assert.strictEqual(devA.sandbox.State.chats.length, 2, 'Device A must have both local and remote chats');

      // Verify Cloud now also has both chats
      const cSnap = await devA.fbSession.getDoc(`users/${uid}/data/chats`);
      const cloudChats = JSON.parse(cSnap.data().chats);
      assert.strictEqual(cloudChats.length, 2, 'Cloud must be reconciled to contain both local offline and remote chats');
      assert.ok(cloudChats.find(c => c.id === 'local_offline_chat'), 'Cloud must contain offline-created chat');
      assert.ok(cloudChats.find(c => c.id === 'cloud_chat_existing'), 'Cloud must retain existing remote chat');
    });

    it('7.4: should trigger throttled cloudLoad and verify listeners on tab resume (visibilitychange, pageshow, focus)', async () => {
      const cloud = createSimulatedCloudBackend();
      const uid = 'resume_tab_uid';
      const dev = createSimulatedSession('dev_resume', cloud);

      dev.sandbox.AuthState.user = { uid, email: 'resume@suna.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;
      dev.sandbox.initEvents();

      let cloudLoadCalled = 0;
      dev.sandbox.cloudLoad = async () => { cloudLoadCalled++; return true; };

      // Simulate visibilitychange to visible
      dev.sandbox.document.visibilityState = 'visible';
      dev.sandbox.document.dispatchEvent({ type: 'visibilitychange' });

      assert.strictEqual(cloudLoadCalled, 1, 'visibilitychange to visible must trigger cloudLoad');

      // Rapid subsequent focus event within 5s throttle should NOT duplicate call
      dev.sandbox.dispatchEvent({ type: 'focus' });
      assert.strictEqual(cloudLoadCalled, 1, 'Subsequent resume event within 5s throttle must be debounced');

      // Simulate pageshow event
      dev.sandbox.dispatchEvent({ type: 'pageshow' });
      assert.strictEqual(cloudLoadCalled, 1, 'pageshow within throttle window must be debounced');
    });

    it('7.5: should enforce document safety slicing when chat histories approach 1MB document quota', async () => {
      const cloud = createSimulatedCloudBackend();
      const dev = createSimulatedSession('dev_quota', cloud);
      const uid = 'quota_guard_uid';

      dev.sandbox.AuthState.user = { uid, email: 'quota@suna.local' };
      dev.sandbox.AuthState.isLoggedIn = true;
      dev.sandbox.AuthState.useLocalOnly = false;

      // Generate a massive chat history with 200 large messages (~1MB)
      const hugeContent = 'A'.repeat(5000);
      const hugeChats = [];
      for (let c = 0; c < 5; c++) {
        const msgs = [];
        for (let m = 0; m < 40; m++) {
          msgs.push({ id: `msg_${c}_${m}`, role: 'user', content: hugeContent, timestamp: 1000 + m, updatedAt: 1000 + m });
        }
        hugeChats.push({ id: `huge_chat_${c}`, title: `Huge Chat ${c}`, messages: msgs, createdAt: 1000 + c, updatedAt: 1000 + c });
      }
      dev.sandbox.State.chats = hugeChats;
      dev.sandbox.State.activeChatId = 'huge_chat_0';

      await dev.sandbox.cloudSave(true);

      const cSnap = await dev.fbSession.getDoc(`users/${uid}/data/chats`);
      assert.ok(cSnap.exists());
      const rawJson = cSnap.data().chats;
      assert.ok(rawJson.length <= 1048576, `Saved JSON (${rawJson.length} bytes) must be strictly under 1MB Firestore document quota`);
    });
  });
});
