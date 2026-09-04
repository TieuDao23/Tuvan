const fs = require('fs');
const assert = require('assert');

describe('Session Idle Auto-New-Chat and Scroll Preservation Test Suite', () => {
  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  describe('1. Static Code Analysis & Syntax Invariants', () => {
    it('should define SESSION_IDLE_TIMEOUT_MS as 30 minutes (1800000 ms)', () => {
      assert.match(appJs, /const\s+SESSION_IDLE_TIMEOUT_MS\s*=\s*(?:30\s*\*\s*60\s*\*\s*1000|1800000)/, 'SESSION_IDLE_TIMEOUT_MS not configured to 30 minutes');
    });

    it('should implement isLongSessionAbsence logic', () => {
      assert.match(appJs, /function\s+isLongSessionAbsence\s*\(/, 'Missing isLongSessionAbsence function');
    });

    it('should implement resolveInitialActiveChat logic', () => {
      assert.match(appJs, /function\s+resolveInitialActiveChat\s*\(/, 'Missing resolveInitialActiveChat function');
    });

    it('should save and restore chat scroll positions', () => {
      assert.match(appJs, /saveChatScrollPosition/, 'Missing saveChatScrollPosition');
      assert.match(appJs, /getChatScrollPosition/, 'Missing getChatScrollPosition');
    });

    it('should track user activity on visibilitychange and beforeunload', () => {
      assert.match(appJs, /addEventListener\(\s*['"]beforeunload['"]/, 'Missing beforeunload listener');
      assert.match(appJs, /addEventListener\(\s*['"]visibilitychange['"]/, 'Missing visibilitychange listener');
    });
  });

  describe('2. Logic Verification (Simulated Unit Tests)', () => {
    let isLongSessionAbsence, resolveInitialActiveChat;

    before(() => {
      const match1 = appJs.match(/function\s+isLongSessionAbsence[^{]*\{([\s\S]*?\n)\}/);
      assert(match1, 'Could not extract isLongSessionAbsence');
      isLongSessionAbsence = new Function('lastActiveTime', 'currentTime', 'timeoutMs', 'isReload', match1[1]);

      const match2 = appJs.match(/function\s+resolveInitialActiveChat[^{]*\{([\s\S]*?\n)\}/);
      assert(match2, 'Could not extract resolveInitialActiveChat');
      resolveInitialActiveChat = new Function('chats', 'savedActiveId', 'isLongAbsence', 'genIdFn', match2[1]);
    });

    it('isLongSessionAbsence returns false on reload regardless of time', () => {
      const now = 1700000000000;
      const longAgo = now - (60 * 60 * 1000); // 1 hour ago
      assert.strictEqual(isLongSessionAbsence(longAgo, now, 1800000, true), false);
    });

    it('isLongSessionAbsence returns false when absence is short (< 30 mins)', () => {
      const now = 1700000000000;
      const recent = now - (10 * 60 * 1000); // 10 mins ago
      assert.strictEqual(isLongSessionAbsence(recent, now, 1800000, false), false);
    });

    it('isLongSessionAbsence returns true when absence is >= 30 mins and not reload', () => {
      const now = 1700000000000;
      const longAgo = now - (35 * 60 * 1000); // 35 mins ago
      assert.strictEqual(isLongSessionAbsence(longAgo, now, 1800000, false), true);
    });

    it('resolveInitialActiveChat restores saved active chat on short absence or reload', () => {
      const chats = [
        { id: 'c1', title: 'Chat 1', messages: [{ id: 'm1', content: 'hello' }] },
        { id: 'c2', title: 'Chat 2', messages: [{ id: 'm2', content: 'world' }] }
      ];
      const result = resolveInitialActiveChat(chats, 'c2', false, () => 'c3');
      assert.strictEqual(result, 'c2');
      assert.strictEqual(chats.length, 2);
    });

    it('resolveInitialActiveChat creates new chat on long absence if top chat has messages', () => {
      const chats = [
        { id: 'c1', title: 'Old Chat', messages: [{ id: 'm1', content: 'hello' }] }
      ];
      const result = resolveInitialActiveChat(chats, 'c1', true, () => 'c_new');
      assert.strictEqual(result, 'c_new');
      assert.strictEqual(chats.length, 2);
      assert.strictEqual(chats[0].id, 'c_new');
      assert.strictEqual(chats[0].title, 'Chat mới');
      assert.strictEqual(chats[0].messages.length, 0);
    });

    it('resolveInitialActiveChat reuses top chat if it is already empty (anti-clutter)', () => {
      const chats = [
        { id: 'c_empty', title: 'Chat mới', messages: [] },
        { id: 'c1', title: 'Older Chat', messages: [{ id: 'm1', content: 'hello' }] }
      ];
      const result = resolveInitialActiveChat(chats, 'c1', true, () => 'c_should_not_create');
      assert.strictEqual(result, 'c_empty');
      assert.strictEqual(chats.length, 2, 'Should not create duplicate empty chat');
    });
  });
});
