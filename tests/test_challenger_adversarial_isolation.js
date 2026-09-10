/**
 * tests/test_challenger_adversarial_isolation.js
 * 
 * Empirical Adversarial Stress Test Suite for Suna Chat
 * Focus: Multi-Account Data Isolation, Brand-New Account Quarantine,
 * Guest Identity F5 Simulation, and Sign-Out Cleanliness & Toast Suppression.
 * 
 * Author: teamwork_preview_challenger_1 (Empirical Challenger)
 * Rules:
 * - Executes actual app.js code inside isolated Node.js VM contexts
 * - Mocks browser primitives (localStorage, IndexedDB, DOM, Firebase SDK)
 * - Empirically stresses race conditions, rapid switches, clean slates, and tombstone guards
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Empirical Adversarial Stress Suite: Multi-Account Data Isolation & Session Integrity', function() {
  this.timeout(20000); // Stress tests simulate 50+ rapid switches and 20 reloads

  let appCode;

  before(() => {
    appCode = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // ENVIRONMENT FACTORY
  // =========================================================================

  function createMockStorage(initialData = {}) {
    const map = new Map();
    for (const [k, v] of Object.entries(initialData)) {
      map.set(k, String(v));
    }
    return {
      getItem: k => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: k => { map.delete(k); },
      clear: () => { map.clear(); },
      key: i => Array.from(map.keys())[i] || null,
      get length() { return map.size; },
      _dump: () => Object.fromEntries(map.entries())
    };
  }

  function createMockIdbStore(initialData = {}) {
    const store = new Map();
    for (const [k, v] of Object.entries(initialData)) {
      store.set(k, JSON.parse(JSON.stringify(v)));
    }
    return {
      idbGet: async (k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
      idbSet: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); },
      idbDelete: async (k) => { store.delete(k); },
      _dump: () => Object.fromEntries(store.entries())
    };
  }

  class MockAudio {
    constructor() {
      this.play = () => Promise.resolve();
      this.pause = () => {};
      this.addEventListener = () => {};
      this.removeEventListener = () => {};
    }
  }

  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  function createHarness(options = {}) {
    const localStorage = options.localStorage || createMockStorage(options.initialLocalStorage);
    const sessionStorage = options.sessionStorage || createMockStorage();
    const idb = options.idb || createMockIdbStore(options.initialIdb);
    const cloudDb = options.cloudDb || new Map(); // path -> data

    const toastLog = [];
    const elements = new Map();
    const docListeners = new Map();
    const winListeners = new Map();

    const createEl = (id = '') => ({
      id,
      style: {},
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      },
      innerHTML: '',
      textContent: '',
      value: '',
      dataset: {},
      remove() { elements.delete(id); },
      appendChild(child) {
        if (id === 'toast-container' && child && child.textContent) {
          toastLog.push({ msg: child.textContent, className: child.className });
        }
      }
    });

    const mockDoc = {
      getElementById: id => {
        if (!elements.has(id)) {
          elements.set(id, createEl(id));
        }
        return elements.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: (t, fn) => {
        if (!docListeners.has(t)) docListeners.set(t, []);
        docListeners.get(t).push(fn);
      },
      removeEventListener: (t, fn) => {
        if (!docListeners.has(t)) return;
        docListeners.set(t, docListeners.get(t).filter(h => h !== fn));
      },
      dispatchEvent: (ev) => {
        const list = docListeners.get(ev.type || ev) || [];
        list.forEach(fn => fn(ev));
      },
      createElement: tag => createEl(tag),
      body: createEl('body')
    };

    // Pre-populate core indicators and toast container
    mockDoc.getElementById('toast-container');
    mockDoc.getElementById('sync-indicator');
    mockDoc.getElementById('auth-screen');
    mockDoc.getElementById('app');
    mockDoc.getElementById('auth-loading');
    mockDoc.getElementById('sidebar-user-info');

    let authStateChangedCb = null;

    const mockFirebase = {
      auth: { currentUser: null },
      db: {},
      googleProvider: {},
      signOutFn: async () => {
        mockFirebase.auth.currentUser = null;
        if (authStateChangedCb) await authStateChangedCb(null);
      },
      onAuthStateChanged: (_auth, cb) => {
        authStateChangedCb = cb;
        return () => { authStateChangedCb = null; };
      },
      serverTimestamp: () => Date.now(),
      doc: (_db, ...paths) => paths.join('/'),
      getDoc: async (docPath) => {
        if (cloudDb.has(docPath)) {
          return {
            exists: () => true,
            data: () => JSON.parse(JSON.stringify(cloudDb.get(docPath)))
          };
        }
        return {
          exists: () => false,
          data: () => null
        };
      },
      setDoc: async (docPath, data) => {
        cloudDb.set(docPath, JSON.parse(JSON.stringify(data)));
      }
    };

    const sandbox = {
      console: {
        log: () => {},
        warn: () => {},
        error: () => {}
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Audio: MockAudio,
      IntersectionObserver: MockObserver,
      MutationObserver: MockObserver,
      ResizeObserver: MockObserver,
      localStorage,
      sessionStorage,
      document: mockDoc,
      addEventListener: (t, fn) => {
        if (!winListeners.has(t)) winListeners.set(t, []);
        winListeners.get(t).push(fn);
      },
      removeEventListener: (t, fn) => {
        if (!winListeners.has(t)) return;
        winListeners.set(t, winListeners.get(t).filter(h => h !== fn));
      },
      dispatchEvent: (ev) => {
        const list = winListeners.get(ev.type || ev) || [];
        list.forEach(fn => fn(ev));
      },
      navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
      crypto: {
        randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
      },
      location: { reload() {} },
      _mockFirebase: mockFirebase,
      _mockIdb: idb,
      _toastLog: toastLog
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(appCode, sandbox);

    // Inject IDB, _fb, and toast interceptor into VM lexical scope
    vm.runInContext(`
      idbSet = _mockIdb.idbSet;
      idbGet = _mockIdb.idbGet;
      idbDelete = _mockIdb.idbDelete;
      _fb = _mockFirebase;
      window._fb = _mockFirebase;

      const _origToast = window.toast;
      window.toast = function(msg, type = 'info') {
        _toastLog.push({ msg, type, time: Date.now() });
        if (typeof _origToast === 'function') {
          try { _origToast(msg, type); } catch (_) {}
        }
      };
      toast = window.toast;
    `, sandbox);

    // Register onAuthStateChanged listener replicating initAuth logic in app.js
    mockFirebase.onAuthStateChanged(mockFirebase.auth, async (user) => {
      if (user) {
        const oldUid = sandbox.AuthState.user ? sandbox.AuthState.user.uid : null;
        sandbox.AuthState.user = user;
        sandbox.AuthState.isLoggedIn = true;
        sandbox.AuthState.isAdmin = (user.email === 'duyanhblt1@gmail.com' || user.email === 'admin@suna.local');
        sandbox.AuthState.useLocalOnly = false;
        sandbox.localStorage.removeItem('suna_guest_mode');

        try {
          if (oldUid !== user.uid) {
            sandbox.clearInMemoryState();
            await sandbox.loadState();
            await sandbox.loadMemory();
          }
          await sandbox.cloudLoad();
        } catch (e) {
          sandbox.console.error(e);
        }
      } else {
        const hadActiveSession = !!(sandbox.AuthState.user || sandbox.getCachedAuthUser());
        sandbox.clearCachedAuth();
        if (sandbox.AuthState._isExplicitSignOut) {
          sandbox.AuthState._isExplicitSignOut = false;
        } else if (hadActiveSession) {
          sandbox.AuthState.user = null;
          sandbox.AuthState.isLoggedIn = false;
          sandbox.AuthState.useLocalOnly = false;
          sandbox.showAuthScreen();
          sandbox.updateUserDisplay();
          sandbox.updateSyncIndicator('offline');
          if (sandbox.window.toast) {
            sandbox.window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info');
          }
        }
      }
    });

    return {
      sandbox,
      localStorage,
      sessionStorage,
      idb,
      cloudDb,
      toastLog,
      triggerAuthState: async (user) => {
        if (authStateChangedCb) await authStateChangedCb(user);
      },
      switchToGuest: async (guestUid) => {
        sandbox.clearInMemoryState();
        sandbox.AuthState.user = { uid: guestUid, email: 'khach@suna.local', displayName: 'Khách' };
        sandbox.AuthState.isLoggedIn = true;
        sandbox.AuthState.useLocalOnly = true;
        localStorage.setItem('suna_guest_mode', 'true');
        await sandbox.loadState();
        await sandbox.loadMemory();
      }
    };
  }

  // =========================================================================
  // MISSION 1: MULTI-ACCOUNT SWITCHING STRESS (50 SEQUENTIAL SWITCHES)
  // =========================================================================

  describe('1. Multi-Account Switching Stress (50 Rapid Sequential Switches)', () => {
    it('should switch across Guest -> User A -> User B -> Guest -> User C for 50 cycles with ZERO cross-account contamination', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, idb, cloudDb, triggerAuthState, switchToGuest } = harness;

      // Seed account profiles
      const userA = { uid: 'user_A_alpha', email: 'alpha@enterprise.org', displayName: 'Alice Alpha' };
      const userB = { uid: 'user_B_beta', email: 'beta@privacy.io', displayName: 'Bob Beta' };
      const userC = { uid: 'user_C_gamma', email: 'gamma@secure.net', displayName: 'Charlie Gamma' };

      // Initialize persistent data for User A in IDB, LocalStorage, and Cloud
      const chatsA = [{ id: 'chat_A1', title: 'User A Secret Project', messages: [{ id: 'm_A1', role: 'user', content: 'Top secret plan A' }] }];
      const settingsA = { apiKey: 'sk-userA-secret-api-key', theme: 'zen', userName: 'Alice Alpha' };
      const memA = { facts: [{ fact: 'User A confidential fact', category: 'identity', timestamp: 1000 }], lastUpdated: 1000 };

      await idb.idbSet('suna_chats_' + userA.uid, chatsA);
      await idb.idbSet('suna_memory_' + userA.uid, memA);
      localStorage.setItem('suna_settings_' + userA.uid, JSON.stringify(settingsA));
      cloudDb.set(`users/${userA.uid}/data/chats`, { chats: JSON.stringify(chatsA), deletedChats: '{}', updatedAt: 1000 });
      cloudDb.set(`users/${userA.uid}/data/settings`, { ...settingsA, updatedAt: 1000 });
      cloudDb.set(`users/${userA.uid}/data/memory`, { ...memA, updatedAt: 1000 });

      // Initialize persistent data for User B in IDB, LocalStorage, and Cloud
      const chatsB = [{ id: 'chat_B1', title: 'User B Vacation Trips', messages: [{ id: 'm_B1', role: 'user', content: 'Flight booking B' }] }];
      const settingsB = { apiKey: 'sk-userB-beta-api-key', theme: 'ink', userName: 'Bob Beta' };
      const memB = { facts: [{ fact: 'User B likes Python', category: 'skill', timestamp: 2000 }], lastUpdated: 2000 };

      await idb.idbSet('suna_chats_' + userB.uid, chatsB);
      await idb.idbSet('suna_memory_' + userB.uid, memB);
      localStorage.setItem('suna_settings_' + userB.uid, JSON.stringify(settingsB));
      cloudDb.set(`users/${userB.uid}/data/chats`, { chats: JSON.stringify(chatsB), deletedChats: '{}', updatedAt: 2000 });
      cloudDb.set(`users/${userB.uid}/data/settings`, { ...settingsB, updatedAt: 2000 });
      cloudDb.set(`users/${userB.uid}/data/memory`, { ...memB, updatedAt: 2000 });

      // Initialize persistent data for User C in IDB, LocalStorage, and Cloud
      const chatsC = [{ id: 'chat_C1', title: 'User C Financial Budget', messages: [{ id: 'm_C1', role: 'user', content: 'Q4 Budget C' }] }];
      const settingsC = { apiKey: 'sk-userC-gamma-api-key', theme: 'aurora', userName: 'Charlie Gamma' };
      const memC = { facts: [{ fact: 'User C works at FinancialCorp', category: 'work', timestamp: 3000 }], lastUpdated: 3000 };

      await idb.idbSet('suna_chats_' + userC.uid, chatsC);
      await idb.idbSet('suna_memory_' + userC.uid, memC);
      localStorage.setItem('suna_settings_' + userC.uid, JSON.stringify(settingsC));
      cloudDb.set(`users/${userC.uid}/data/chats`, { chats: JSON.stringify(chatsC), deletedChats: '{}', updatedAt: 3000 });
      cloudDb.set(`users/${userC.uid}/data/settings`, { ...settingsC, updatedAt: 3000 });
      cloudDb.set(`users/${userC.uid}/data/memory`, { ...memC, updatedAt: 3000 });

      // Initialize Guest profile
      const guestUid = sandbox.getOrCreateGuestUid();
      await idb.idbSet('suna_chats_' + guestUid, [
        { id: 'chat_G1', title: 'Guest Public Inquiries', messages: [{ id: 'm_G1', role: 'user', content: 'What is Suna Chat?' }] }
      ]);
      await idb.idbSet('suna_memory_' + guestUid, {
        facts: [{ fact: 'Guest explores anonymously', category: 'context', timestamp: 500 }],
        lastUpdated: 500
      });
      localStorage.setItem('suna_settings_' + guestUid, JSON.stringify({
        apiKey: '',
        theme: 'aurora',
        userName: 'Khách'
      }));

      // Start initial session as Guest
      await switchToGuest(guestUid);
      assert.strictEqual(sandbox.State.chats[0].title, 'Guest Public Inquiries');

      // The 5-step cycle to repeat for 50 rapid sequential switches
      // Guest -> User A -> User B -> Guest -> User C
      const cycle = [
        { type: 'guest', profile: { uid: guestUid }, expectedTitle: 'Guest Public Inquiries', expectedKey: '' },
        { type: 'userA', profile: userA, expectedTitle: 'User A Secret Project', expectedKey: 'sk-userA-secret-api-key' },
        { type: 'userB', profile: userB, expectedTitle: 'User B Vacation Trips', expectedKey: 'sk-userB-beta-api-key' },
        { type: 'guest', profile: { uid: guestUid }, expectedTitle: 'Guest Public Inquiries', expectedKey: '' },
        { type: 'userC', profile: userC, expectedTitle: 'User C Financial Budget', expectedKey: 'sk-userC-gamma-api-key' }
      ];

      const TOTAL_SWITCHES = 50;
      for (let i = 0; i < TOTAL_SWITCHES; i++) {
        const step = cycle[i % cycle.length];

        if (step.type === 'guest') {
          await switchToGuest(guestUid);
        } else {
          await triggerAuthState(step.profile);
        }

        // Assert Suffix matches target UID
        const currentSuffix = sandbox.getStorageSuffix();
        assert.strictEqual(currentSuffix, '_' + step.profile.uid, `Switch ${i}: suffix must match current UID`);

        // Assert State.chats isolation
        assert.ok(sandbox.State.chats && sandbox.State.chats.length > 0, `Switch ${i}: chats must be loaded`);
        assert.strictEqual(sandbox.State.chats[0].title, step.expectedTitle, `Switch ${i}: active chat title mismatch`);

        // ADVERSARIAL CHECK 1: Ensure User B NEVER contains User A data
        if (step.type === 'userB') {
          const hasUserAChat = sandbox.State.chats.some(c => c.title.includes('User A') || c.id === 'chat_A1');
          assert.strictEqual(hasUserAChat, false, `VIOLATION: User B state contains User A chats at switch ${i}!`);

          const hasUserAKey = sandbox.State.settings.apiKey.includes('userA');
          assert.strictEqual(hasUserAKey, false, `VIOLATION: User B settings contains User A apiKey at switch ${i}!`);

          const hasUserAFact = sandbox.State.memory.facts.some(f => f.fact.includes('User A'));
          assert.strictEqual(hasUserAFact, false, `VIOLATION: User B memory contains User A fact at switch ${i}!`);
        }

        // ADVERSARIAL CHECK 2: Ensure User A NEVER contains User B or C data
        if (step.type === 'userA') {
          const hasAlienChat = sandbox.State.chats.some(c => c.title.includes('User B') || c.title.includes('User C') || c.title.includes('Guest'));
          assert.strictEqual(hasAlienChat, false, `VIOLATION: User A state contains alien chats at switch ${i}!`);

          const hasAlienKey = sandbox.State.settings.apiKey.includes('userB') || sandbox.State.settings.apiKey.includes('userC');
          assert.strictEqual(hasAlienKey, false, `VIOLATION: User A settings contains alien keys at switch ${i}!`);
        }

        // ADVERSARIAL CHECK 3: Ensure Guest NEVER inherits private API keys
        if (step.type === 'guest') {
          assert.strictEqual(sandbox.State.settings.apiKey, '', `VIOLATION: Guest inherited non-empty apiKey at switch ${i}!`);
          const hasPrivateChat = sandbox.State.chats.some(c => c.id.startsWith('chat_A') || c.id.startsWith('chat_B') || c.id.startsWith('chat_C'));
          assert.strictEqual(hasPrivateChat, false, `VIOLATION: Guest state contains private user chats at switch ${i}!`);
        }
      }

      // End of 50 switches: Verify all records on disk (IDB and localStorage) are pristine
      const finalChatsA = await idb.idbGet('suna_chats_' + userA.uid);
      assert.strictEqual(finalChatsA[0].title, 'User A Secret Project');

      const finalChatsB = await idb.idbGet('suna_chats_' + userB.uid);
      assert.strictEqual(finalChatsB[0].title, 'User B Vacation Trips');

      const finalChatsC = await idb.idbGet('suna_chats_' + userC.uid);
      assert.strictEqual(finalChatsC[0].title, 'User C Financial Budget');

      const finalChatsGuest = await idb.idbGet('suna_chats_' + guestUid);
      assert.strictEqual(finalChatsGuest[0].title, 'Guest Public Inquiries');
    });
  });

  // =========================================================================
  // MISSION 2: BRAND-NEW ACCOUNT QUARANTINE
  // =========================================================================

  describe('2. Brand-New Account Quarantine (Zero Dirty RAM Inheritance)', () => {
    it('should quarantine a newly registered account after heavy guest usage with 0 inherited chats or files in State.vfs', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, idb, cloudDb, triggerAuthState } = harness;

      const guestUid = sandbox.getOrCreateGuestUid();
      sandbox.AuthState.user = { uid: guestUid, email: 'khach@suna.local', displayName: 'Khách' };
      sandbox.AuthState.isLoggedIn = true;
      sandbox.AuthState.useLocalOnly = true;

      // Simulate Heavy Guest Usage:
      // 1. 10 rich chats
      const heavyChats = [];
      for (let c = 1; c <= 10; c++) {
        heavyChats.push({
          id: `guest_chat_${c}`,
          title: `Guest Work Project #${c}`,
          messages: [
            { id: `m_${c}_1`, role: 'user', content: `Guest query ${c}` },
            { id: `m_${c}_2`, role: 'assistant', content: `Guest response ${c}`, images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='] }
          ],
          createdAt: Date.now() - c * 10000,
          updatedAt: Date.now() - c * 10000
        });
      }
      sandbox.State.chats = heavyChats;
      sandbox.State.activeChatId = 'guest_chat_5';

      // 2. 5 semantic memory facts
      sandbox.State.memory = {
        facts: [
          { fact: 'Guest prefers high visual density', category: 'preference' },
          { fact: 'Guest uses Vue and React', category: 'skill' },
          { fact: 'Guest is building an e-commerce site', category: 'work' },
          { fact: 'Guest lives in Hanoi', category: 'identity' },
          { fact: 'Guest wants dark mode by default', category: 'preference' }
        ],
        lastUpdated: Date.now()
      };

      // 3. Customized settings with private secret key
      sandbox.State.settings = {
        baseUrl: 'https://guest.custom.ai/v1',
        apiKey: 'sk-guest-confidential-secret-888',
        systemPrompt: 'You are the guest super assistant',
        theme: 'ink',
        fontSize: 18,
        userName: 'Guest Boss'
      };

      // 4. Virtual File System (VFS) with 5 project files
      sandbox.State.vfs = {
        'index.html': '<h1>Guest Super App</h1>',
        'styles.css': 'body { background: #000; }',
        'main.js': 'console.log("guest script");',
        'schema.sql': 'CREATE TABLE guest_data (id INT);',
        'README.md': '# Guest Confidential Docs'
      };

      // 5. Workspace logs & active generation state
      sandbox.State.workspaceMessages = [{ role: 'user', content: 'Generate app' }, { role: 'assistant', content: 'Done' }];
      sandbox.State.workspaceConsoleLogs = ['[Console] Guest build success', '[Warning] Deprecated API'];
      sandbox.State.pendingImages = ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='];
      sandbox.State.pendingFiles = [{ name: 'guest_upload.pdf', size: 1024 }];
      sandbox.State.isGenerating = true;
      sandbox.State.abortController = new AbortController();

      // Save guest state to storage
      sandbox.saveLocalStateOnly();
      await sandbox.saveMemory();

      // Verify guest state is safely on disk
      const diskGuestChats = await idb.idbGet('suna_chats_' + guestUid);
      assert.strictEqual(diskGuestChats.length, 10, 'Guest 10 chats must be saved to disk');

      // NOW: User registers a brand-new official account
      const brandNewUid = 'user_brand_new_777';
      const newAccountProfile = { uid: brandNewUid, email: 'newbie@suna.org', displayName: 'Fresh User' };

      // Ensure cloud has NO documents for this new user (isNewAccount === true)
      // triggerAuthState triggers onAuthStateChanged -> cloudLoad()
      await triggerAuthState(newAccountProfile);

      // ADVERSARIAL INSPECTIONS ON BRAND-NEW ACCOUNT:
      // 1. Chats quarantine: 0 inherited chats from guest!
      assert.ok(sandbox.State.chats.length <= 1, 'New account chats must be at most 1 (default chat)');
      if (sandbox.State.chats.length === 1) {
        assert.strictEqual(sandbox.State.chats[0].title, 'Chat mới', 'Default chat must be clean "Chat mới"');
        assert.strictEqual(sandbox.State.chats[0].messages.length, 0, 'Default chat must have 0 messages');
        assert.ok(!sandbox.State.chats[0].id.includes('guest'), 'Default chat ID must not be from guest');
      }

      // 2. VFS quarantine: 0 files in State.vfs!
      assert.strictEqual(Object.keys(sandbox.State.vfs).length, 0, 'State.vfs MUST have 0 keys for a new account!');

      // 3. Workspace quarantine: 0 messages or console logs!
      assert.strictEqual(sandbox.State.workspaceMessages.length, 0, 'State.workspaceMessages must be empty');
      assert.strictEqual(sandbox.State.workspaceConsoleLogs.length, 0, 'State.workspaceConsoleLogs must be empty');
      assert.strictEqual(sandbox.State.pendingImages.length, 0, 'State.pendingImages must be empty');
      assert.strictEqual(sandbox.State.pendingFiles.length, 0, 'State.pendingFiles must be empty');

      // 4. Memory quarantine: 0 inherited memory facts!
      assert.strictEqual(sandbox.State.memory.facts.length, 0, 'State.memory.facts MUST be empty for new account!');

      // 5. Settings quarantine: clean default settings!
      assert.strictEqual(sandbox.State.settings.apiKey, '', 'New account apiKey must be empty string');
      assert.strictEqual(sandbox.State.settings.systemPrompt, '', 'New account systemPrompt must be empty');
      assert.strictEqual(sandbox.State.settings.baseUrl, '', 'New account baseUrl must be empty');

      // 6. AbortController / generation flag reset:
      assert.strictEqual(sandbox.State.isGenerating, false, 'isGenerating must be reset to false');

      // 7. Cloud Upload Validation: verify what was uploaded to Firestore for this new user
      const cloudChatsDoc = cloudDb.get(`users/${brandNewUid}/data/chats`);
      assert.ok(cloudChatsDoc, 'New account clean state should be synced to cloud');
      const uploadedChats = JSON.parse(cloudChatsDoc.chats);
      assert.strictEqual(uploadedChats.length, 1);
      assert.strictEqual(uploadedChats[0].title, 'Chat mới');
      assert.strictEqual(uploadedChats[0].messages.length, 0);

      const cloudMemDoc = cloudDb.get(`users/${brandNewUid}/data/memory`);
      assert.ok(cloudMemDoc, 'New account memory doc must exist');
      assert.strictEqual(cloudMemDoc.facts.length, 0, 'Cloud memory facts must be clean empty array');

      // 8. Disk Integrity: Guest chats must remain intact on disk under guestUid
      const guestChatsStillOnDisk = await idb.idbGet('suna_chats_' + guestUid);
      assert.strictEqual(guestChatsStillOnDisk.length, 10, 'Guest chats on disk must NOT be destroyed by new account registration');
    });
  });

  // =========================================================================
  // MISSION 3: GUEST IDENTITY F5 SIMULATION (20 CONSECUTIVE PAGE RELOADS)
  // =========================================================================

  describe('3. Guest Identity F5 Simulation (20 Consecutive Page Reloads)', () => {
    it('should maintain stable suffix and 100% data retention across 20 browser reloads in guest mode', async () => {
      // Shared persistent browser storage surviving F5
      const sharedLocalStorage = createMockStorage();
      const sharedIdb = createMockIdbStore();

      // --- INITIAL BOOT ---
      const initialHarness = createHarness({ localStorage: sharedLocalStorage, idb: sharedIdb });
      const initialSandbox = initialHarness.sandbox;

      // First page load: initAuth() -> Guest setup
      const guestUid = initialSandbox.getOrCreateGuestUid();
      assert.ok(guestUid.startsWith('guest_'), 'Guest UID must start with guest_');

      initialSandbox.AuthState.user = { uid: guestUid, email: 'khach@suna.local', displayName: 'Khách' };
      initialSandbox.AuthState.isLoggedIn = true;
      initialSandbox.AuthState.useLocalOnly = true;
      sharedLocalStorage.setItem('suna_guest_mode', 'true');

      const initialSuffix = initialSandbox.getStorageSuffix();
      assert.strictEqual(initialSuffix, '_' + guestUid, 'Initial suffix must match _guest_<id>');

      // Guest creates 5 chats
      const initialChats = [
        { id: 'g_c1', title: 'Research Quantum Computing', messages: [{ role: 'user', content: 'Explain qubits' }], createdAt: 1000, updatedAt: 1000 },
        { id: 'g_c2', title: 'Drafting Contract A', messages: [{ role: 'user', content: 'Write NDA' }], createdAt: 2000, updatedAt: 2000 },
        { id: 'g_c3', title: 'Japanese Vocabulary', messages: [{ role: 'user', content: 'Kanji practice' }], createdAt: 3000, updatedAt: 3000 },
        { id: 'g_c4', title: 'Deleted Draft', messages: [{ role: 'user', content: 'Discard me' }], createdAt: 4000, updatedAt: 4000 },
        { id: 'g_c5', title: 'Travel Itinerary Tokyo', messages: [{ role: 'user', content: '3 days in Shibuya' }], createdAt: 5000, updatedAt: 5000 }
      ];

      initialSandbox.State.chats = [...initialChats];
      initialSandbox.State.activeChatId = 'g_c3';

      // Guest deletes chat g_c4
      initialSandbox.State.chats = initialSandbox.State.chats.filter(c => c.id !== 'g_c4');
      initialSandbox.State.deletedChats = { 'g_c4': 4500 };

      // Guest adds memory facts & settings
      initialSandbox.State.memory = {
        facts: [
          { fact: 'Prefers concise bullet points', category: 'preference', timestamp: 1000 },
          { fact: 'Learning Japanese N3', category: 'skill', timestamp: 2000 }
        ],
        lastUpdated: 2000
      };
      initialSandbox.State.settings.theme = 'zen';
      initialSandbox.State.settings.fontSize = 17;
      initialSandbox.State.settings.userName = 'Khách Quen';

      // Persist state & activeChatId
      initialSandbox.saveLocalStateOnly();
      sharedLocalStorage.setItem('suna_active_chat_id' + initialSuffix, 'g_c3');
      await initialSandbox.saveMemory();

      // --- SIMULATE 20 CONSECUTIVE F5 RELOADS ---
      const TOTAL_RELOADS = 20;
      for (let r = 1; r <= TOTAL_RELOADS; r++) {
        // Fresh harness simulates browser destroying JS memory on F5 reload
        const reloadHarness = createHarness({ localStorage: sharedLocalStorage, idb: sharedIdb });
        const s = reloadHarness.sandbox;

        // Run guest bootstrap in new environment
        const reloadGuestUid = s.getOrCreateGuestUid();
        assert.strictEqual(reloadGuestUid, guestUid, `Reload ${r}: Guest UID changed! Expected ${guestUid}, got ${reloadGuestUid}`);

        s.AuthState.user = { uid: reloadGuestUid, email: 'khach@suna.local', displayName: 'Khách' };
        s.AuthState.isLoggedIn = true;
        s.AuthState.useLocalOnly = true;

        const reloadSuffix = s.getStorageSuffix();
        assert.strictEqual(reloadSuffix, initialSuffix, `Reload ${r}: getStorageSuffix() changed!`);

        // Load state & memory from disk
        await s.loadState();
        await s.loadMemory();

        // 1. Verify chat retention (4 active chats)
        assert.strictEqual(s.State.chats.length, 4, `Reload ${r}: expected 4 active chats, got ${s.State.chats.length}`);
        const titles = s.State.chats.map(c => c.title);
        assert.ok(titles.includes('Research Quantum Computing'), `Reload ${r}: missing chat 1`);
        assert.ok(titles.includes('Drafting Contract A'), `Reload ${r}: missing chat 2`);
        assert.ok(titles.includes('Japanese Vocabulary'), `Reload ${r}: missing chat 3`);
        assert.ok(titles.includes('Travel Itinerary Tokyo'), `Reload ${r}: missing chat 5`);
        assert.ok(!titles.includes('Deleted Draft'), `Reload ${r}: deleted chat must remain deleted!`);

        // 2. Verify deletion tombstone retention
        assert.strictEqual(s.State.deletedChats['g_c4'], 4500, `Reload ${r}: deletion tombstone lost!`);

        // 3. Verify settings retention
        assert.strictEqual(s.State.settings.theme, 'zen', `Reload ${r}: theme not preserved`);
        assert.strictEqual(s.State.settings.fontSize, 17, `Reload ${r}: font size not preserved`);
        assert.strictEqual(s.State.settings.userName, 'Khách Quen', `Reload ${r}: user name not preserved`);

        // 4. Verify memory facts retention
        assert.strictEqual(s.State.memory.facts.length, 2, `Reload ${r}: memory facts count mismatch`);
        assert.strictEqual(s.State.memory.facts[0].fact, 'Prefers concise bullet points');

        // 5. Verify active chat preservation
        assert.strictEqual(s.State.activeChatId, 'g_c3', `Reload ${r}: activeChatId must be g_c3`);
      }
    });
  });

  // =========================================================================
  // MISSION 4: SIGN-OUT CLEANLINESS & FALSE TOAST SUPPRESSION
  // =========================================================================

  describe('4. Sign-Out Cleanliness & False Toast Suppression', () => {
    it('should scrub RAM on deliberate logout without wiping disk guest chats and suppress false expiry toast', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, idb, toastLog } = harness;

      // Pre-seed Guest chats on disk
      const guestUid = sandbox.getOrCreateGuestUid();
      await idb.idbSet('suna_chats_' + guestUid, [
        { id: 'guest_preserved_1', title: 'Valuable Guest Chat', messages: [{ role: 'user', content: 'Do not delete me' }] }
      ]);

      // Setup logged-in user
      const userProfile = { uid: 'user_active_999', email: 'owner@suna.local', displayName: 'Owner' };
      localStorage.setItem('suna_cached_user', JSON.stringify(userProfile));

      sandbox.AuthState.user = userProfile;
      sandbox.AuthState.isLoggedIn = true;
      sandbox.AuthState.useLocalOnly = false;
      sandbox.AuthState._isExplicitSignOut = false;

      // User has active state in RAM
      sandbox.State.chats = [
        { id: 'user_c1', title: 'Confidential Business Proposal', messages: [{ role: 'user', content: 'Prop 1' }] }
      ];
      sandbox.State.memory = {
        facts: [{ fact: 'Owner is admin', category: 'identity' }],
        lastUpdated: Date.now()
      };
      sandbox.State.vfs = { 'secret.key': '12345' };
      sandbox.State.settings.apiKey = 'sk-owner-key-999';

      // Save user state
      sandbox.saveLocalStateOnly();
      await sandbox.saveMemory();

      // Clear toast log before logout
      toastLog.length = 0;

      // Execute deliberate user logout
      await sandbox.handleLogout();
      console.log('DEBUG toastLog in 4.1:', toastLog);

      // CHECK 1: Explicit sign-out flag was used to guard false toast
      const expiredToasts = toastLog.filter(t => t.msg && t.msg.includes('Phiên đăng nhập đã hết hạn'));
      assert.strictEqual(expiredToasts.length, 0, 'Deliberate logout MUST NOT fire "Phiên đăng nhập đã hết hạn" toast!');

      const logoutToasts = toastLog.filter(t => t.msg && t.msg.includes('Đã đăng xuất'));
      assert.strictEqual(logoutToasts.length, 1, 'Must fire "Đã đăng xuất" info toast');

      // CHECK 2: RAM is completely scrubbed
      assert.strictEqual(sandbox.State.chats.length, 0, 'State.chats must be empty after logout');
      assert.strictEqual(sandbox.State.memory.facts.length, 0, 'State.memory.facts must be empty after logout');
      assert.strictEqual(Object.keys(sandbox.State.vfs).length, 0, 'State.vfs must be empty after logout');
      assert.strictEqual(sandbox.State.settings.apiKey, '', 'State.settings.apiKey must be reset');

      // CHECK 3: CRITICAL - Guest chats on disk were NOT overwritten!
      const diskGuestChats = await idb.idbGet('suna_chats_' + guestUid);
      assert.ok(diskGuestChats && diskGuestChats.length === 1, 'Guest chats on disk MUST be preserved!');
      assert.strictEqual(diskGuestChats[0].id, 'guest_preserved_1');
      assert.strictEqual(diskGuestChats[0].title, 'Valuable Guest Chat');

      // CHECK 4: Cached user was removed
      assert.strictEqual(localStorage.getItem('suna_cached_user'), null, 'Cached auth user must be cleared');
    });

    it('should properly fire "Phiên đăng nhập đã hết hạn" when session is unexpectedly revoked (counter-check)', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, toastLog, triggerAuthState } = harness;

      const userProfile = { uid: 'user_active_999', email: 'owner@suna.local', displayName: 'Owner' };
      localStorage.setItem('suna_cached_user', JSON.stringify(userProfile));

      sandbox.AuthState.user = userProfile;
      sandbox.AuthState.isLoggedIn = true;
      sandbox.AuthState.useLocalOnly = false;
      sandbox.AuthState._isExplicitSignOut = false; // NOT a deliberate logout!

      // Simulate unexpected token expiry or server-side revocation
      // onAuthStateChanged fires with user = null
      await triggerAuthState(null);
      console.log('DEBUG toastLog in 4.2:', toastLog);

      // In this unexpected scenario, the warning toast MUST fire!
      const expiredToasts = toastLog.filter(t => t.msg && t.msg.includes('Phiên đăng nhập đã hết hạn'));
      assert.strictEqual(expiredToasts.length, 1, 'Unexpected token expiry MUST fire "Phiên đăng nhập đã hết hạn" warning toast!');
    });
  });

  // =========================================================================
  // MISSION 5: ADVERSARIAL EDGE CASE & BOUNDARY STRESS
  // =========================================================================

  describe('5. Adversarial Edge Cases & Boundary Stress', () => {
    it('should resist prefix collision attacks between user_1 and user_10', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, idb } = harness;

      // Seed user_1 and user_10
      await idb.idbSet('suna_chats_user_1', [{ id: 'c1', title: 'Data of User 1' }]);
      await idb.idbSet('suna_chats_user_10', [{ id: 'c10', title: 'Data of User 10' }]);

      localStorage.setItem('suna_settings_user_1', JSON.stringify({ apiKey: 'KEY_USER_1' }));
      localStorage.setItem('suna_settings_user_10', JSON.stringify({ apiKey: 'KEY_USER_10' }));

      // Load User 1
      sandbox.AuthState.user = { uid: 'user_1' };
      sandbox.AuthState.isLoggedIn = true;
      await sandbox.loadState();
      assert.strictEqual(sandbox.State.chats[0].title, 'Data of User 1');
      assert.strictEqual(sandbox.State.settings.apiKey, 'KEY_USER_1');

      // Load User 10
      sandbox.clearInMemoryState();
      sandbox.AuthState.user = { uid: 'user_10' };
      await sandbox.loadState();
      assert.strictEqual(sandbox.State.chats[0].title, 'Data of User 10');
      assert.strictEqual(sandbox.State.settings.apiKey, 'KEY_USER_10');
      assert.ok(!sandbox.State.settings.apiKey.includes('USER_1_'));
    });

    it('should gracefully handle corrupt JSON in localStorage without contaminating state or crashing', async () => {
      const harness = createHarness();
      const { sandbox, localStorage, idb } = harness;

      const uid = 'user_corrupt_test';
      localStorage.setItem('suna_settings_' + uid, 'CORRUPT_NOT_JSON{{[[');
      localStorage.setItem('suna_deleted_chats_' + uid, '<<<BAD_JSON>>>');

      sandbox.AuthState.user = { uid };
      sandbox.AuthState.isLoggedIn = true;

      // Should load defaults without throwing uncaught error
      await sandbox.loadState();

      assert.strictEqual(typeof sandbox.State.settings, 'object');
      assert.strictEqual(sandbox.State.settings.apiKey, '');
      assert.strictEqual(Object.keys(sandbox.State.deletedChats).length, 0);
    });
  });
});
