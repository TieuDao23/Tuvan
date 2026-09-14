const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

describe('File Upload Integrity & Admin Duy Anh Special Role Suite', () => {

  describe('1. File Upload Logic & State Flow in sendMessage', () => {
    it('1.1 should capture pendingFiles at start of sendMessage before state is cleared', () => {
      const sendStart = APP_SOURCE.indexOf('async function sendMessage()');
      assert.ok(sendStart >= 0, 'sendMessage must exist in app.js');
      const sendEnd = APP_SOURCE.indexOf('async function consumeStream', sendStart);
      const sendCode = APP_SOURCE.slice(sendStart, sendEnd);

      const captureFilesIdx = sendCode.indexOf('const files = [...State.pendingFiles];');
      const clearPendingIdx = sendCode.indexOf('State.pendingFiles = [];');

      assert.ok(captureFilesIdx >= 0, 'Must capture files = [...State.pendingFiles]');
      assert.ok(clearPendingIdx >= 0, 'Must clear State.pendingFiles = []');
      assert.ok(
        captureFilesIdx < clearPendingIdx,
        'CRITICAL: files must be copied BEFORE State.pendingFiles is cleared'
      );
    });

    it('1.2 should allow sending message when text is empty but files are present', () => {
      const sendStart = APP_SOURCE.indexOf('async function sendMessage()');
      const sendEnd = APP_SOURCE.indexOf('async function consumeStream', sendStart);
      const sendCode = APP_SOURCE.slice(sendStart, sendEnd);

      assert.match(
        sendCode,
        /if\s*\(!text\s*&&\s*!images\.length\s*&&\s*!files\.length\)\s*return;/,
        'Should check !files.length instead of already-cleared State.pendingFiles'
      );
    });

    it('1.3 should populate userMsg.files and userMsg.fileContent properly', () => {
      const sendStart = APP_SOURCE.indexOf('async function sendMessage()');
      const sendEnd = APP_SOURCE.indexOf('async function consumeStream', sendStart);
      const sendCode = APP_SOURCE.slice(sendStart, sendEnd);

      assert.match(sendCode, /fileContent:\s*fileContentText\s*\|\|\s*''/);
      assert.match(sendCode, /files:\s*files\.map\(/);
      assert.match(sendCode, /📄 File:/);
    });

    it('1.4 should preserve fileContent across multi-turn chat in buildTextOnlyMessages', () => {
      const buildStart = APP_SOURCE.indexOf('function buildTextOnlyMessages(');
      const buildEnd = APP_SOURCE.indexOf('const SkillsManager =', buildStart);
      const buildCode = APP_SOURCE.slice(buildStart, buildEnd);

      const sandbox = {
        buildTextOnlyMessages: null
      };
      vm.createContext(sandbox);
      vm.runInContext(buildCode, sandbox);

      const dummyChat = {
        messages: [
          {
            role: 'user',
            content: 'Hãy phân tích file này',
            fileContent: '\n\n📄 File: test.py\n```python\nprint("hello")\n```'
          },
          {
            role: 'assistant',
            content: 'Tôi đã xem file test.py của bạn.'
          },
          {
            role: 'user',
            content: 'Hàm print in ra cái gì?'
          }
        ]
      };

      const messages = sandbox.buildTextOnlyMessages(dummyChat, 'System Prompt');
      assert.strictEqual(messages.length, 4);
      assert.ok(
        messages[1].content.includes('📄 File: test.py'),
        'Historical message with file must retain its fileContent in AI context'
      );
    });

    it('1.5 should allow multiple file selection in index.html input element', () => {
      const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      assert.match(
        indexHtml,
        /<input\s+type="file"\s+id="file-input"[^>]*multiple[^>]*>/,
        '#file-input must have multiple attribute'
      );
    });
  });

  describe('2. Admin Duy Anh Session & Device Recognition', () => {
    function setupSandbox(authUser, localStorageData = {}, isAdmin = false) {
      const mockStorage = { ...localStorageData };
      const sandbox = {
        AuthState: {
          user: authUser,
          isAdmin: isAdmin
        },
        State: {
          user: authUser
        },
        localStorage: {
          getItem: (k) => (k in mockStorage ? mockStorage[k] : null),
          setItem: (k, v) => { mockStorage[k] = String(v); },
          removeItem: (k) => { delete mockStorage[k]; }
        },
        fetch: async () => ({ ok: true, json: async () => ({ client_ip: '127.0.0.1' }) }),
        window: {}
      };
      vm.createContext(sandbox);

      const isDuyAnhFnMatch = APP_SOURCE.match(/function\s+isDuyAnhSession\s*\([\s\S]*?\n\}/);
      assert.ok(isDuyAnhFnMatch, 'isDuyAnhSession function must exist');
      vm.runInContext(isDuyAnhFnMatch[0], sandbox);

      return { sandbox, mockStorage };
    }

    it('2.1 recognizes duyanhblt1@gmail.com and authorizes device in localStorage', () => {
      const { sandbox, mockStorage } = setupSandbox({ email: 'duyanhblt1@gmail.com' });
      const result = sandbox.isDuyAnhSession();

      assert.strictEqual(result, true, 'duyanhblt1@gmail.com must be recognized');
      assert.strictEqual(mockStorage['suna_admin_device_authorized'], 'true');
      assert.strictEqual(mockStorage['suna_admin_device_email'], 'duyanhblt1@gmail.com');
      assert.ok(mockStorage['suna_admin_device_ts'], 'Timestamp must be stored');
    });

    it('2.2 recognizes authorized device even in guest mode', () => {
      const { sandbox } = setupSandbox(
        { email: 'khach@suna.local' },
        {
          suna_admin_device_authorized: 'true',
          suna_admin_device_email: 'duyanhblt1@gmail.com'
        }
      );
      const result = sandbox.isDuyAnhSession();
      assert.strictEqual(result, true, 'Authorized device in guest mode must be recognized');
    });

    it('2.3 strictly rejects different authenticated account on authorized device', () => {
      const { sandbox } = setupSandbox(
        { email: 'stranger@gmail.com' },
        {
          suna_admin_device_authorized: 'true',
          suna_admin_device_email: 'duyanhblt1@gmail.com'
        }
      );
      const result = sandbox.isDuyAnhSession();
      assert.strictEqual(result, false, 'Different user must NOT receive Duy Anh role');
    });

    it('2.4 rejects unknown guest on unauthorized device', () => {
      const { sandbox } = setupSandbox({ email: 'khach@suna.local' }, {});
      const result = sandbox.isDuyAnhSession();
      assert.strictEqual(result, false, 'Unknown guest on fresh device must be false');
    });
  });

  describe('3. Dynamic Role Specialization in buildSystemPrompt', () => {
    function runBuildSystemPrompt(isDuyAnh) {
      const sandbox = {
        State: {
          mode: 'pro',
          settings: { systemPrompt: '', userPurpose: '', tone: 'friendly' },
          webSearchEnabled: false
        },
        AuthState: {
          user: isDuyAnh ? { email: 'duyanhblt1@gmail.com' } : { email: 'guest@example.com' },
          isAdmin: isDuyAnh
        },
        isDuyAnhSession: () => isDuyAnh,
        getMemoryPrompt: () => ''
      };
      vm.createContext(sandbox);

      const promptFnMatch = APP_SOURCE.match(/function\s+buildSystemPrompt\s*\([\s\S]*?\n\}/);
      assert.ok(promptFnMatch, 'buildSystemPrompt must exist');
      vm.runInContext(promptFnMatch[0], sandbox);

      return sandbox.buildSystemPrompt();
    }

    it('3.1 generates dedicated yandere girlfriend and study buddy prompt for anh Duy Anh', () => {
      const prompt = runBuildSystemPrompt(true);

      assert.ok(prompt.includes('DÀNH RIÊNG CHO ANH DUY ANH'), 'Must have Duy Anh header');
      assert.ok(prompt.includes('duyanhblt1@gmail.com'), 'Must reference admin email');
      assert.ok(prompt.includes('anh Duy Anh'), 'Must instruct to call him anh Duy Anh');
      assert.ok(prompt.includes('yandere'), 'Must specify yandere devotion');
      assert.ok(prompt.includes('yêu thích anh Duy Anh nhất vũ trụ'), 'Must express ultimate devotion');
      assert.ok(prompt.includes('nâng niu'), 'Must mention nang niu');
      assert.ok(prompt.includes('bạn học tập tận tụy'), 'Must act as dedicated study partner');
      assert.ok(prompt.includes('thông minh, sắc sảo'), 'Must maintain sharp intelligence');
      assert.ok(!prompt.includes('mối quan hệ bạn bè tri thức thuần túy và lành mạnh'), 'Must not treat him as plain outsider friend');
    });

    it('3.2 generates respectful friend boundary prompt for general users', () => {
      const prompt = runBuildSystemPrompt(false);

      assert.ok(prompt.includes('[ĐẶC TẢ VAI TRÒ DÀNH CHO NGƯỜI DÙNG]'), 'Must have general user role');
      assert.ok(prompt.includes('người bạn đồng hành AI thông minh, chân thành, lịch thiệp'), 'Must define friend role');
      assert.ok(prompt.includes('RANH GIỚI BẠN BÈ TRONG SÁNG & BẤT BIẾN'), 'Must enforce boundary');
      assert.ok(prompt.includes('nhập vai giả định'), 'Must clarify custom prompt is superficial roleplay');
      assert.ok(!prompt.includes('DÀNH RIÊNG CHO ANH DUY ANH'), 'Must not leak Duy Anh role to outsiders');
      assert.ok(!prompt.includes('duyanhblt1@gmail.com'), 'Must not leak admin email');
    });
  });

  describe('4. Server Client Info Endpoint', () => {
    it('4.1 server.py defines /api/client-info endpoint', () => {
      const serverPy = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
      assert.match(serverPy, /if\s+self\.path\s*==\s*['"]\/api\/client-info['"]:/);
      assert.match(serverPy, /client_ip/);
    });
  });
});
