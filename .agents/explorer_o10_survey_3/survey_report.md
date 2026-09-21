# Báo Cáo Khảo Sát & Thiết Kế Kiến Trúc Kiểm Thử (Milestone R3)
## Testing Infrastructure, Harness & Full Regression Survey Report

- **Subagent**: `explorer_o10_survey_3` (Explorer Archetype)
- **Working Directory**: `d:\Suna Chat\.agents\explorer_o10_survey_3`
- **Target Milestone**: R3 (Testing Infrastructure, Harness & Full Regression)
- **Parent ID**: `5c061cb9-df2e-4230-be85-8d036737099c`
- **Timestamp**: 2026-09-20T14:48:00Z

---

## 1. Baseline Test Execution Benchmark

### 1.1 Package.json Scripts & Configuration
Đã kiểm tra tệp `package.json` tại thư mục gốc của dự án:
```json
{
  "name": "suna-chat",
  "version": "2.0.0",
  "description": "Suna Chat - Modern AI Web Application with Zen Dark & Live Workspace",
  "main": "app.js",
  "scripts": {
    "test": "npx mocha --exit --timeout 15000 \"tests/**/*.js\"",
    "check": "node -c app.js && node -c redesign.js && node -c suna_agent.js && node -c suna_harness.js"
  },
  "keywords": ["ai", "chat", "workspace", "vanilla-js"],
  "author": "Suna Team",
  "license": "MIT"
}
```

### 1.2 Kết Quả Đo Lường Baseline Suite (`npm test`)
- **Lệnh thực thi**: `npm test` (`npx mocha --exit --timeout 15000 "tests/**/*.js"`)
- **Tổng số tests**: **1.768 tests passing** (100% Green).
- **Số tests thất bại (failing)**: **0**.
- **Số tests bỏ qua (pending/skipped)**: **0**.
- **Thời gian chạy**: **10 giây**.
- **Mã thoát (Exit code)**: `0`.
- **Cú pháp tĩnh (`npm run check`)**:
  - `node -c app.js`: 0 syntax errors
  - `node -c redesign.js`: 0 syntax errors
  - `node -c suna_agent.js`: 0 syntax errors
  - `node -c suna_harness.js`: 0 syntax errors

### 1.3 Đánh Giá Độ Ổn Định & Vấn Đề Timing / Treo Process
- **Hiện tượng Flaky**: Không phát hiện bất kỳ bài test flaky nào trong suite 1.768 tests; kết quả hoàn toàn xác định (deterministic).
- **Vấn đề Mocha Event Loop & Cờ `--exit`**:
  - Trong `package.json`, cờ `--exit` được chỉ định bắt buộc (`npx mocha --exit --timeout 15000 "tests/**/*.js"`).
  - Khi chạy Mocha trong môi trường Node.js có mô phỏng Browser DOM (như `window`, `setInterval`, `setTimeout`, debounced event listeners), nếu thiếu cờ `--exit` (ví dụ như trong `run_verification.py:73`), Node.js event loop sẽ đợi các timer/handle rỗng giải phóng và có thể bị treo hoặc trễ thoát tiến trình.
  - **Khuyến nghị kiến trúc cho Implementer**: Đảm bảo tất cả các script kiểm thử tự động (`package.json`, `run_verification.py`, batch scripts) luôn trang bị cờ `--exit` khi gọi Mocha.

---

## 2. Bản Đồ Kiến Trúc Bộ Kiểm Thử (Test Suite Architecture)

### 2.1 Cấu Trúc Thư Mục
Toàn bộ các bộ kiểm thử tự động của dự án được tập trung tại thư mục `d:\Suna Chat\tests\` (không sử dụng thư mục `test/`):
- **Tổng số tệp kiểm thử**: **64 tệp JavaScript** (`.js`).
- **Phân nhóm chính**:
  1. `tests/*.js`: 52 tệp kiểm thử tích hợp, chức năng, đối kháng và hồi quy.
  2. `tests/ui_redesign/visible_tests/`: 6 tệp kiểm thử giao diện visible.
  3. `tests/ui_redesign/hidden_tests/`: 5 tệp kiểm thử ẩn.
  4. `tests/ui_redesign/adversarial_tests/`: 1 tệp kiểm thử đối kháng.

### 2.2 Phân Bố Số Lượng Tests Theo Các Module Trọng Điểm

| Module / Phân Vùng | Tệp Test Đại Diện | Số Test Đã Pass | Nội Dung Bao Phủ |
|---|---|:---:|---|
| **SunaHarness Core** | `tests/test_suna_harness.js` | **265** | VFS Inodes, DiffEngine (Myers LCS), SchemaValidator, Checkpoint IDB, Visualizer DOM |
| **Token Continuation Engine** | `tests/test_e2e_token_continuation_engine.js` | **218** | Multi-turn continuation, chunk stitching, token ceiling |
| **SunaAgent Cognitive Engine** | `tests/test_suna_agent.js` | **179** | 22 Core Features, 4 Tiers (Feature, Boundary, Combinations, Real-World Workflows) |
| **Auth & Multi-Account** | `tests/test_auth_and_account_sync.js` | **64** | Multi-tenant isolation, guest UID persistence, 3-way sync |
| **SunaAgent Adversarial** | `tests/test_challenger_suna_agent_adversarial.js` | **56** | Circuit breakers, runaway loops, deep recursion, malformed inputs |
| **Schema Adversarial** | `tests/test_challenger_m2_schema_adversarial.js` | **41** | Schema fuzzing, ReDoS attacks, circular JSON injection |
| **Reasoning Effort Engine** | `tests/test_reasoning_effort_dropdown_and_cognitive_engine.js` | **35** | 6 cấp độ reasoning effort, meta-prompts, API gateway mapping |
| **Event Bus & Trajectory** | `tests/test_challenger_m1_event_bus_and_trajectory.js` | **34** | Inter-harness event bus, trajectory stitching, correlation IDs |
| **DSH Core Tools Suite** | `tests/test_dsh_core_tools.js` | **29** | 11 Core Tools across 5 domains (Sandbox, Web, VFS, Memory, Diagrams) |
| **Workspace Live Sync** | `tests/test_workspace_direct_sync_and_continuation.js` | **29** | Live workspace 2-way sync, editor textarea, iframe preview |
| **DSH Tool Registry** | `tests/test_dsh_tool_registry.js` | **26** | Dynamic tool lifecycle, registration, parameter validation |
| **Thinking Blocks Parser** | `tests/test_thinking_blocks_stream_parser_adversarial.js` | **26** | Extended thinking tags extraction, unclosed streaming tags |
| **DSH ReAct Loop** | `tests/test_dsh_react_loop_and_trajectory.js` | **15** | ReAct execution loop, recursion depth guard, stuck detection |
| **Zero Regression Matrix** | `tests/test_dsh_zero_regression_matrix.js` | **22** | 9-gate regression matrix verifying public contracts & DOM |

---

## 3. Khảo Sát Chi Tiết Các Khiếm Khuyết & Vị Trí Cần Khắc Phục (R1 & R2)

### 3.1 Nhóm Lỗi Vòng Đời & Lõi SunaAgent (R1)
1. **`SunaAgent.run()` nạp Tool Registry & Gắn kết VFS mặc định**:
   - *Hiện trạng*: Trong `suna_agent.js:1947`, `run()` gọi `this._runLegacy()` hoặc luồng mới. Khi khởi tạo độc lập không qua `bridgeSunaHarness()` trong `app.js`, `this._harnessVfs` có thể là `null`, dẫn đến lỗi khi gọi công cụ ACI.
   - *Vị trí*: `suna_agent.js:1947` và `suna_agent.js:1220` (constructor). Cần auto-mount `new VfsSandbox()` và đăng ký sẵn các công cụ mặc định.
2. **Ngắt sớm trong vòng lặp ReAct `_runLegacy`**:
   - *Hiện trạng*: Tại `suna_agent.js:2156-2162`:
     ```javascript
     const reflection = stepResult.reflection;
     if (reflection && reflection.satisfied === false && reflection.replanNeeded) {
       if (turn >= maxTurns) finalStatus = 'max_turns_exceeded';
       continue;
     }
     finalStatus = 'completed';
     break;
     ```
     Sau bước đầu tiên, nếu không có `replanNeeded`, vòng lặp lập tức gán `finalStatus = 'completed'` và `break;`. Khi agent có kế hoạch nhiều bước (multi-step plan với 3-5 bước), agent dừng ngay sau bước 1 và không bao giờ thực thi các bước tiếp theo!
   - *Giải pháp*: Cần duy trì con trỏ chỉ số bước (`currentStepIndex`), kiểm tra xem toàn bộ các bước trong kế hoạch đã hoàn tất chưa trước khi ngắt vòng lặp.
3. **Lệnh can thiệp `steer()` không khôi phục trạng thái sau Circuit Breaker**:
   - *Hiện trạng*: Tại `suna_agent.js:1695-1705`:
     ```javascript
     steer(instruction) {
       if (!instruction || typeof instruction !== 'string' || !instruction.trim()) return false;
       const trimmed = instruction.trim();
       this.steerInstructions.push(trimmed);
       this.memory.setFact('latest_steer', trimmed);
       this.consecutiveFailures = 0;
       this.haltReason = null;
       this.emit('steer_applied', { instruction: trimmed });
       return true;
     }
     ```
     `steer()` reset `consecutiveFailures` và `haltReason`, nhưng **KHÔNG** đặt `this.status = 'idle'` và **KHÔNG** đặt `this.isAgentAborted = false`. Do đó, tại `executeStep:1709` (`if (this.status === 'halted' || this.isAgentAborted)`), agent tiếp tục từ chối thực thi!
4. **`MultiSyntaxParser` nhầm lẫn file cấu hình (như `package.json`) thành Tool Call**:
   - *Hiện trạng*: Tại `suna_agent.js:330-344`:
     ```javascript
     const mdPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
     while ((m = mdPattern.exec(text)) !== null) {
       const parsed = JsonAutoRepair.safeParse(m[1].trim());
       if (parsed && (parsed.tool || parsed.name)) {
         calls.push({ tool: parsed.tool || parsed.name, args: ... });
       }
     }
     ```
     Một tệp `package.json` có thuộc tính `"name": "suna-chat"`, `"version": "2.0.0"`. Parser kiểm tra `parsed.name`, thấy có giá trị nên lầm tưởng `"suna-chat"` là tên tool và thêm vào danh sách tool calls để gọi!
   - *Giải pháp*: Phải phân biệt rõ tool call thực sự (phải có `args`/`arguments`/`parameters` hoặc tên tool nằm trong registry được đăng ký) với JSON cấu hình thông thường (có các trường đặc trưng như `version`, `scripts`, `dependencies`, `main`).
5. **`_boundObservation` làm mất cờ lỗi `isError` khi truncate**:
   - *Hiện trạng*: Tại `suna_agent.js:1456`:
     ```javascript
     const marker = `\n…[truncated ${serialized.length - limit} chars; use a narrower tool query]`;
     const text = serialized.slice(0, Math.max(0, limit - marker.length)) + marker;
     return { value: text, text, truncated: true, originalLength: serialized.length };
     ```
     Khi `value` ban đầu là một object có `{ isError: true, error: "..." }`, hàm lại gán `value: text` (string). Kết quả trả về không còn thuộc tính `isError: true` nữa, khiến tầng reflection hiểu sai là lệnh thực thi thành công!

### 3.2 Nhóm Lỗi Chức Năng Trong 22 Tools (R2)
1. **`memory_store` trong `app.js` tự phát hiện trùng lặp khiến `saveMemory(true)` không bao giờ được gọi**:
   - *Hiện trạng*: Tại `app.js:4649`:
     ```javascript
     state.memory.facts.push(memoryEntry); // Đã push vào State.memory.facts
     if (typeof addMemoryFact === 'function') {
       try { addMemoryFact(fact, category); } catch (e) {}
     }
     ```
     Trong `addMemoryFact` (`app.js:5473`):
     ```javascript
     const isDuplicate = State.memory.facts.some(f => f.fact.toLowerCase().trim() === fact.toLowerCase().trim());
     if (isDuplicate) return false; // Thấy đã có mục vừa push ở 4649 => return false ngay!
     ...
     saveMemory(true); // KHÔNG BAO GIỜ ĐƯỢC CHẠY TỚI!
     ```
     Hậu quả: Fact được lưu trong biến RAM nhưng không bao giờ được ghi xuống `localStorage`. Khi người dùng F5 tải lại trang, fact bị mất sạch!
2. **`fs_patch` ném `ReferenceError: content is not defined`**:
   - *Hiện trạng*: Tại `app.js:4594`:
     ```javascript
     const byteLength = typeof Buffer !== 'undefined'
       ? Buffer.byteLength(patched, 'utf8')
       : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(patched).length : content.length);
     ```
     Trong phạm vi hàm `fs_patch`, biến chứa nội dung sau vá là `patched` (nội dung gốc là `original`), hoàn toàn không có biến nào tên `content`. Khi chạy trong môi trường thiếu cả `Buffer` lẫn `TextEncoder`, câu lệnh quăng `ReferenceError: content is not defined`.
3. **`replace_file_content` để lại dòng trống thừa `\n\n` khi xóa dòng**:
   - *Hiện trạng*: Tại `suna_harness.js:828-834`:
     ```javascript
     const before = allLines.slice(0, startLine - 1);
     const after = allLines.slice(endLine);
     const combined = [];
     if (before.length > 0) combined.push(before.join('\n'));
     combined.push(replacedSlice);
     if (after.length > 0) combined.push(after.join('\n'));
     newContent = combined.join('\n');
     ```
     Khi xóa dòng (`replacementContent: ""`), `replacedSlice` là `""`. Phép nối `combined.join('\n')` giữa `before`, `""`, và `after` tạo ra hai ký tự xuống dòng liên tiếp (`\n\n`), để lại một dòng trống thừa không mong muốn.
4. **`fetch_page_summary` trả về HTML giả lập (mock HTML) gây ảo giác AI**:
   - *Hiện trạng*: Tại `app.js:4447-4449`:
     ```javascript
     if (!rawHtml) {
       rawHtml = `<html><head><script>alert('xss')<\/script><style>body{}<\/style></head><body><nav>Menu</nav><main><h1>Tiêu đề trang</h1><p>Nội dung văn bản chính được trích xuất an toàn từ trang web.</p></main><footer>Bản quyền 2026</footer></body></html>`;
     }
     ```
     Khi gặp lỗi mạng hoặc proxy không tải được, hàm tự tạo một đoạn HTML giả lập "Tiêu đề trang" và trả về `{ success: true }` với nội dung giả này. AI đọc được nội dung giả lập và sinh ảo giác với người dùng! Cần trả về `{ success: false, error: ... }`.
5. **`run_sandboxed_command` & `sandbox_exec` lỗi `const`/`let`, thoát sandbox & cờ `readOnly`**:
   - *Hiện trạng*: Tại `suna_harness.js:3250`:
     `const fn = new Function('sandbox', 'with(sandbox) { return (' + code + '); }');`
     Khi code có khai báo `const a = 1;` hoặc `let b = 2;`, cú pháp `return (const a = 1;)` gây ra `SyntaxError: Unexpected token 'const'`. Đồng thời, việc truy cập `Object.constructor("return this")()` cho phép mã trong sandbox lấy được đối tượng `window`/`globalThis` thực tế của host. Ngoài ra cần tôn trọng cờ `readOnly`.
6. **Chuẩn hóa Parameter Aliases trước khi validate schema**:
   - Cần gọi `AciSchemaValidator.normalizeArgs` trong `executeTool` để ánh xạ thông suốt giữa các tên tham số tương đương (`TargetFile` $\leftrightarrow$ `path`, `Query` $\leftrightarrow$ `query`, `CommandLine` $\leftrightarrow$ `command`).
7. **Bóc tách đường dẫn từ lệnh shell redirection `>` để phát sự kiện `vfs_change`**:
   - Tại `suna_harness.js:3202-3216`, khi shell thực hiện chuyển hướng `>` hoặc `>>` ghi vào tệp, cần bóc tách đúng đường dẫn tệp đích và phát sự kiện `vfs_change` kèm nội dung mới để đồng bộ hóa ngay lập tức sang Live Workspace.

---

## 4. Chiến Lược Phân Bổ Kiểm Thử: 60% Visible / 40% Hidden (Grounded Self-Correction Loop)

Tuân thủ nghiêm ngặt **RULE[user_global] § 2**: Để ngăn chặn hiện tượng AI "gian lận đặc tả" (chỉ viết code đối phó để pass test visible mà không đảm bảo tính đúng đắn tổng thể), bộ test mới phải được chia thành **60% Visible Tests** và **40% Hidden Tests**.

### 4.1 Bảng Phân Bổ Tổng Thể (60 Tests Dự Kiến)

| Nhóm Yêu Cầu | Mục Tiêu Bao Phủ | Visible Tests (60%) | Hidden Tests (40%) | Tổng Tests |
|---|---|:---:|:---:|:---:|
| **R1. SunaAgent Lifecycle & Core** | run() VFS mount, ReAct loop, steer() recovery, JSON parser, bound observation | 12 | 8 | **20** |
| **R2. 22 Tools Functional Integrity** | memory_store, fs_patch, replace_file_content, fetch_page_summary, sandbox const/let, aliases, vfs_change | 15 | 10 | **25** |
| **R3. E2E Multi-Step ReAct & Integration** | Multi-step agent workflow, live workspace sync, zero-regression matrix | 9 | 6 | **15** |
| **TỔNG CỘNG** | **Toàn diện 3 nhóm R1, R2, R3** | **36 (60.0%)** | **24 (40.0%)** | **60** |

---

### 4.2 Chi Tiết Các Trường Hợp Kiểm Thử: R1 — SunaAgent Lifecycle & Core (20 Tests)

#### Visible Tests (12 tests) — `tests/ui_redesign/visible_tests/test_r1_agent_lifecycle_visible.js`
1. `R1-V1`: `SunaAgent.run()` tự động nạp tool registry đầy đủ nếu chưa được nạp.
2. `R1-V2`: `SunaAgent` tự động khởi tạo `_harnessVfs` (VfsSandbox) mặc định khi chưa gắn kết.
3. `R1-V3`: `_runLegacy` duy trì biến `currentStepIndex` tăng dần qua từng bước của kế hoạch đa bước.
4. `R1-V4`: `_runLegacy` thực thi tuần tự từ bước 0 đến bước N mà không bị dừng ngắt sau bước 1.
5. `R1-V5`: `_runLegacy` chỉ trả về `status: 'completed'` khi tất cả các bước đã kết thúc.
6. `R1-V6`: `agent.steer(guidance)` khôi phục trạng thái `this.status = 'idle'` từ trạng thái `'halted'`.
7. `R1-V7`: `agent.steer(guidance)` đặt lại `this.isAgentAborted = false` sau khi Circuit Breaker ngắt.
8. `R1-V8`: `MultiSyntaxParser.parse()` bỏ qua các khối Markdown JSON chứa `package.json` (`version`, `scripts`).
9. `R1-V9`: `MultiSyntaxParser.parse()` vẫn nhận diện chính xác các tool call hợp lệ có `name` và `arguments`.
10. `R1-V10`: `MultiSyntaxParser.parse()` ưu tiên thẻ XML `<suna_tool_call>` khi có cả XML lẫn JSON config.
11. `R1-V11`: `_boundObservation` bảo toàn cờ `isError: true` khi chuỗi lỗi dài hơn 1500 ký tự bị cắt ngắn.
12. `R1-V12`: `_boundObservation` giữ nguyên `isError: false` đối với kết quả thành công dài vượt ngưỡng.

#### Hidden Tests (8 tests) — `tests/ui_redesign/hidden_tests/test_r1_agent_lifecycle_hidden.js`
1. `R1-H1`: Tạo instance `SunaAgent` độc lập trong Node.js vm và gọi công cụ ACI thành công mà không có lỗi "Harness VFS not attached".
2. `R1-H2`: Đang chạy kế hoạch 4 bước, bước 2 gặp lỗi kích hoạt `replanNeeded`, kế hoạch cập nhật và hoàn thành nốt các bước còn lại.
3. `R1-H3`: Kế hoạch vượt quá `maxTurns` dừng chính xác với trạng thái `'max_turns_exceeded'` và lưu đầy đủ trajectory đã thực thi.
4. `R1-H4`: Gọi `steer()` sau khi agent bị ngắt do 3 lỗi liên tiếp (anti-oscillation) cho phép agent tiếp tục chạy bước mới bình thường.
5. `R1-H5`: Gọi `steer("")` với chuỗi rỗng hoặc khoảng trắng không làm thay đổi trạng thái `'halted'` của agent.
6. `R1-H6`: Parser phân biệt đúng tệp `tsconfig.json` và `manifest.json` không coi chúng là tool calls.
7. `R1-H7`: Khối JSON dị dạng nằm trước một tool call hợp lệ được auto-repair và không làm gián đoạn việc parse tool call hợp lệ.
8. `R1-H8`: Cắt ngắn stack trace lỗi sâu (>5000 ký tự) bảo toàn trạng thái lỗi trong Trajectory step và diagnostic object của Reflection.

---

### 4.3 Chi Tiết Các Trường Hợp Kiểm Thử: R2 — 22 Tools Functional Integrity (25 Tests)

#### Visible Tests (15 tests) — `tests/ui_redesign/visible_tests/test_r2_tools_functional_visible.js`
1. `R2-V1`: `memory_store` lưu fact thành công và tự động gọi `saveMemory(true)` ghi dữ liệu bền vững.
2. `R2-V2`: `memory_store` phát hiện trùng lặp chính xác và không gọi thừa hàm lưu khi fact đã tồn tại.
3. `R2-V3`: `memory_query` truy vấn đúng fact vừa lưu theo từ khóa và danh mục sau khi giả lập tải lại.
4. `R2-V4`: `fs_patch` thực thi bình thường và không ném `ReferenceError: content is not defined` trong môi trường giả lập thiếu `Buffer` và `TextEncoder`.
5. `R2-V5`: `fs_patch` tính toán đúng độ dài ký tự bằng `patched.length` khi dùng phương án dự phòng.
6. `R2-V6`: `replace_file_content` khi xóa một dòng (`replacementContent: ""`) không tạo thêm dòng trống `\n\n`.
7. `R2-V7`: `replace_file_content` khi xóa nhiều dòng liên tiếp giữ nguyên tính liền mạch của các dòng xung quanh.
8. `R2-V8`: `fetch_page_summary` trả về `{ success: false, error: ... }` khi gặp lỗi mạng/URL không truy cập được.
9. `R2-V9`: `fetch_page_summary` tuyệt đối không trả về đoạn HTML giả lập "Tiêu đề trang" / "Nội dung văn bản chính" khi lỗi.
10. `R2-V10`: `sandbox_exec` và `run_sandboxed_command` thực thi trơn tru mã JavaScript có khai báo `const` và `let`.
11. `R2-V11`: `sandbox_exec` chặn hoàn toàn việc thoát sandbox qua `Object.constructor("return window")()`.
12. `R2-V12`: `run_sandboxed_command` từ chối các lệnh sửa đổi file khi VFS đặt ở chế độ `readOnly: true`.
13. `R2-V13`: Các công cụ ACI chấp nhận tham số alias chuẩn (`TargetFile` lẫn `path`, `Query` lẫn `query`).
14. `R2-V14`: `AciSchemaValidator.normalizeArgs` chuẩn hóa thông suốt tham số trước khi chuyển cho `validateParameters`.
15. `R2-V15`: Lệnh `echo "data" > output.txt` bóc tách chính xác đường dẫn `output.txt` và phát sự kiện `vfs_change`.

#### Hidden Tests (10 tests) — `tests/ui_redesign/hidden_tests/test_r2_tools_functional_hidden.js`
1. `R2-H1`: `memory_store` lưu nhiều fact liên tiếp; mảng facts trong `localStorage` phản ánh đầy đủ mọi mục mới.
2. `R2-H2`: `fs_patch` xử lý chính xác chuỗi có ký tự Unicode tiếng Việt có dấu (`à, ệ, ỹ, ợ...`) khi tính độ dài byte.
3. `R2-H3`: `replace_file_content` xóa dòng đầu tiên của tệp tin không để lại ký tự `\n` ở đầu tệp.
4. `R2-H4`: `replace_file_content` xóa dòng cuối cùng của tệp tin không để lại khoảng trống kép `\n\n` ở cuối tệp.
5. `R2-H5`: `fetch_page_summary` trong môi trường offline không sinh ảo giác; trả về mã lỗi chuẩn đoán rõ ràng.
6. `R2-H6`: Can thiệp prototype (`__proto__`) trong sandbox không làm biến đổi prototype của môi trường host ngoài.
7. `R2-H7`: Vòng lặp vô tận trong mã JavaScript chứa `const`/`let` kích hoạt ngắt an toàn timeout trong giới hạn quy định.
8. `R2-H8`: Truyền tham số hỗn hợp (`targetFile`, `startLine`, `searchPath`) vào công cụ ACI không bị ném `SCHEMA_VALIDATION_ERROR`.
9. `R2-H9`: Lệnh nối tiếp chuyển hướng `echo "append" >> log.txt` phát sự kiện `vfs_change` kèm toàn bộ nội dung sau khi nối.
10. `R2-H10`: Chuyển hướng vào đường dẫn có khoảng trắng hoặc ký tự đặc biệt được bóc tách chính xác tệp đích.

---

### 4.4 Chi Tiết Các Trường Hợp Kiểm Thử: R3 — End-to-End Multi-Step ReAct & Integration (15 Tests)

#### Visible Tests (9 tests) — `tests/ui_redesign/visible_tests/test_r3_e2e_react_visible.js`
1. `R3-V1`: Agent nhận nhiệm vụ 3 bước (Tạo file -> Sửa file -> Kiểm tra file) thực thi hoàn chỉnh tuần tự từ đầu đến cuối.
2. `R3-V2`: Trajectory ghi lại đầy đủ từng bước `thought -> plan -> action -> observation -> reflection`.
3. `R3-V3`: Kết quả trả về sau nhiệm vụ 3 bước có `status: 'completed'` và `turnsExecuted === 3`.
4. `R3-V4`: Thao tác `fs_write` phát sự kiện `vfs_change` và tự động cập nhật `#artifact-editor-textarea`.
5. `R3-V5`: Thao tác `replace_file_content` phát sự kiện `vfs_change` và kích hoạt synthetic `input` event trên Live Workspace.
6. `R3-V6`: Lệnh shell `echo ... > index.html` cập nhật đồng thời editor textarea và preview iframe `srcdoc`.
7. `R3-V7`: Toàn bộ 1.768 bài test hiện có tiếp tục vượt qua 100% không có bất kỳ hồi quy nào.
8. `R3-V8`: `npm run check` vượt qua với 0 lỗi cú pháp trên tất cả các tệp mã nguồn.
9. `R3-V9`: Thời gian chạy toàn bộ test suite hoàn thành trong thời gian tối ưu (< 15 giây).

#### Hidden Tests (6 tests) — `tests/ui_redesign/hidden_tests/test_r3_e2e_react_hidden.js`
1. `R3-H1`: Agent trong quy trình đa bước gặp lỗi ở bước 2 tự phản tỉnh (reflection), sửa lỗi (self-correction) và tiếp tục hoàn thành bước 3.
2. `R3-H2`: Nhiệm vụ 5 bước phức tạp thực thi liên tục mà không bị dừng ngắt giữa chừng ở bất kỳ bước nào.
3. `R3-H3`: Các thao tác ghi tệp trên nhiều tệp khác nhau phát sự kiện `vfs_change` độc lập và cách ly dữ liệu tệp chuẩn xác.
4. `R3-H4`: Nhiều thao tác thay đổi tệp diễn ra liên tục được debounce mượt mà trên UI preview mà không làm mất bản ghi cập nhật.
5. `R3-H5`: Kiểm tra không rò rỉ tài nguyên: VFS và Trajectory được giải phóng sạch sẽ khi phiên kết thúc.
6. `R3-H6`: Dual runtime test: Chạy cùng một kịch bản đa bước trên Node.js headless và mô phỏng Browser DOM cho ra kết quả đồng nhất.

---

## 5. Kế Hoạch & Phương Pháp Luận Xác Thực E2E Thực Tế

### 5.1 Kiểm Chứng Vòng Lặp ReAct Đa Bước Không Bị Ngắt Sớm
- **Phương pháp**:
  - Khởi tạo `SunaAgent` với `HarnessController` và `VfsSandbox`.
  - Cung cấp một `decisionProvider` mô phỏng Agent đa bước:
    - Lượt 1: Gọi `fs_write` tạo `scaffold.js` với mã có lỗi logic.
    - Lượt 2: Gọi `run_sandboxed_command` để chạy `node -e "require('./scaffold.js')"` và nhận diện lỗi.
    - Lượt 3: Gọi `replace_file_content` để phẫu thuật sửa lỗi.
    - Lượt 4: Gọi `run_sandboxed_command` để xác thực lại và kết luận hoàn thành.
  - **Tiêu chí nghiệm thu**:
    - `result.status === 'completed'`
    - `result.turnsExecuted === 4`
    - Trajectory chứa đúng 4 sự kiện công cụ theo tuần tự.
    - Tệp `scaffold.js` trong VFS chứa mã nguồn đã sửa chuẩn xác.

### 5.2 Kiểm Chứng Sự Kiện `vfs_change` Với Live Workspace
- **Phương pháp**:
  - Gắn mock DOM với các phần tử `#artifact-editor-textarea`, `#artifact-iframe`, và listener sự kiện `window.addEventListener('vfs_change', handler)`.
  - Thực thi lệnh shell: `run_sandboxed_command({ CommandLine: 'echo "<h1>Xin chào Suna</h1>" > index.html' })`.
  - **Tiêu chí nghiệm thu**:
    - Listener nhận được sự kiện `vfs_change` với `path === 'index.html'` và nội dung tương ứng.
    - Thuộc tính `editor.value` nhận được `<h1>Xin chào Suna</h1>\n`.
    - Iframe nhận được `srcdoc` cập nhật.
    - Một sự kiện `new Event('input', { bubbles: true })` được phát đi từ editor.

### 5.3 Ma Trận Tiêu Chuẩn Nghiệm Thu Cuối Cùng (Acceptance Gate)
1. **Suite Pass 100%**:
   - `npm test` vượt qua 1.768 + 60 = **1.828+ tests PASS**, 0 failing, 0 pending.
2. **Syntax Integrity**:
   - `npm run check` (hoặc `node -c app.js && node -c redesign.js && node -c suna_agent.js && node -c suna_harness.js`) đạt 0 lỗi cú pháp.
3. **Verification Runner**:
   - `python run_verification.py` đạt 100% màu xanh, hiển thị đúng tỷ lệ phân bổ Visible / Hidden.
4. **Execution Performance**:
   - Toàn bộ suite chạy xong trong $\le 15\text{ giây}$, không bị treo process (nhờ cờ `--exit`).
