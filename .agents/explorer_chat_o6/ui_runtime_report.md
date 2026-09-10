# Báo Cáo Khảo Sát Kỹ Thuật: SunaChat Frontend, Live Workspace & Kiến Trúc Dual Runtime Cho SunaAgent

**Tác giả**: UI & Runtime Explorer (`explorer_chat_o6`)  
**Mục tiêu**: Khảo sát toàn diện mã nguồn SunaChat (`app.js`, `redesign.js`, `index.html`, `suna_harness.js`), cơ chế quản lý tin nhắn, luồng streaming, đồng bộ hóa Live Workspace, thành phần `SunaHarnessVisualizer`, và thiết kế kiến trúc Dual Runtime (Browser & Node.js) không phụ thuộc bên ngoài (Zero Dependencies) cho **SunaAgent**.  
**Thời gian thực hiện**: 2026-09-07T16:20:00Z  
**Trạng thái kiểm thử hiện tại**: 1.226 / 1.226 tests PASS (100% green), 0 syntax errors (`node -c`).

---

## 1. Tổng Quan Kiến Trúc Hệ Sinh Thái SunaChat & SunaAgent

Hệ sinh thái SunaChat vận hành theo mô hình phân tầng chặt chẽ:

```
+-----------------------------------------------------------------------------------------+
|                                    SunaChat Client UI                                   |
| - index.html: 3-Pane Split Layout, Sidebar, Top Bar, Chat Area, Modals                  |
| - styles.css: Zen Dark/Light Themes, Glassmorphism, Z-Index Hierarchy                   |
| - redesign.js: Minimal CSS/Template Transformer utility (0 syntax errors)              |
+-----------------------------------------------------------------------------------------+
                                         │
                 +-----------------------+-----------------------+
                 ▼                                               ▼
+----------------------------------+            +----------------------------------+
|      Chat & Streaming Engine     |            |       Live Workspace 3-Pane      |
| - sendMessage() & SSE Reader     |            | - #artifact-editor-textarea      |
| - StreamParser & Tool Demux      |            | - #artifact-iframe (Sandbox)     |
| - Thinking Block Tokenization    |            | - autoApplyWorkspaceCode()       |
| - formatMessage() Placeholder Sys|            | - Workspace AI Chat Assistant    |
+----------------------------------+            +----------------------------------+
                 │                                               │
                 +-----------------------+-----------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------------+
|                         SunaAgent Cognitive Engine (Mục tiêu M4)                        |
| - OODA / ReAct++: Intent Analysis -> Hierarchical Planning -> Extended Thinking        |
|                   -> Tool Calling -> Observation Reflection                             |
| - Dual Runtime Abstraction: Browser (window/IndexedDB/DOM) & Node.js (CJS/ESM/Headless) |
| - Zero External Dependencies: Pure Vanilla JS ES6+                                      |
| - HITL Controls: Pause, Resume, Steer, Rewind Hooks                                     |
+-----------------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------------+
|                          Suna Agent Harness (suna_harness.js)                           |
| - VfsSandbox & VfsDiffEngine (Unified Git Diff generation)                              |
| - ACI Tools Suite (view_file, replace_file_content, grep_search, find_by_name, ...)     |
| - AciSchemaValidator & Grounded Self-Correction Loop                                    |
| - TrajectoryEngine (Hierarchical tree representation, step metrics, JSONL/MD)          |
| - CheckpointManager & IndexedDbCheckpointStore (CoW snapshots, Rollback, Time-Travel)   |
| - SunaHarnessVisualizer (Trajectory Tree, Benchmark Scorecard, VFS Diff Viewer)         |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Khảo Sát Chi Tiết Các Tệp Mã Nguồn Giao Diện

### 2.1. `index.html` (929 dòng)
- **Cấu trúc khung nhìn**:
  - **Auth Screen** (dòng 43-219): Màn hình đăng nhập/đăng ký/Google/Guest với hệ thống hiệu ứng Orb background và loading overlay.
  - **Sidebar** (dòng 229-297): Quản lý danh sách hội thoại (`#chat-list`), bộ lọc thư mục (`#folder-pills-bar`), tìm kiếm (`#chat-search-input`), chuyển đổi chế độ Flash/Pro (`#mode-toggle`), và các nút chân trang (Settings, Trí nhớ Suna, Tính cách).
  - **Top Bar** (dòng 305-391): Hiển thị model hiện tại (`#current-model-display`), Suna Lofi Player (`#suna-lofi-player` với thanh visualizer sóng nhạc `#lofi-visualizer`), Sync indicator (`#sync-indicator`), nút kích hoạt Live Workspace (`#btn-toggle-workspace`), nút xuất hội thoại, cài đặt API.
  - **Chat Area** (dòng 394-431): Màn hình chào mừng (`#welcome-screen`), vùng chứa tin nhắn (`#messages-container`), nút cuộn nhanh (`#btn-scroll-bottom`), vùng kéo thả file (`#drag-drop-overlay`).
  - **Input Area** (dòng 433-470): Thanh công cụ bổ trợ (`btn-web-search`, `btn-translator-mode`, `btn-chat-to-mindmap`), mic giọng nói, đính kèm tệp/ảnh, và textarea tin nhắn (`#message-input`).
  - **Live Workspace 3-Pane Panel** (dòng 838-919):
    - Khung chia đôi có thể kéo giãn: Handle bên trái `#workspace-left-handle` (`z-index: 1001`).
    - Cột 1 (Editor): `#artifact-editor-container` chứa thanh công cụ bài mẫu (blank, html5, svg, tailwind, chartjs, particles) và `#artifact-editor-textarea`.
    - Resizer 1: `#artifact-resizer-1`.
    - Cột 2 (Preview): `#artifact-preview-container` chứa `#artifact-iframe` (sandbox: `allow-scripts allow-modals allow-forms`) và ngăn kéo Developer Console (`#workspace-console-drawer`).
    - Resizer 2: `#artifact-resizer-2`.
    - Cột 3 (Workspace Chat): `#artifact-chat-container` chứa lịch sử `#workspace-chat-messages` và ô nhập `#workspace-chat-input`.
  - **Thứ tự nạp script** (dòng 924-925):
    1. `<script src="suna_harness.js"></script>`
    2. `<script src="app.js?v=7"></script>`

### 2.2. `redesign.js` (12 dòng)
- **Hiện trạng**: Tệp CommonJS tối giản (`version: '2.0.0'`) đóng vai trò module tiện ích cho các stylesheet/template transforms.
- **Yêu cầu tương thích**: Được kiểm tra nghiêm ngặt trong `test_dsh_zero_regression_matrix.js` (dòng 47), `test_topbar_layout_and_css_hygiene.js` (dòng 160) và script `npm run check` (`node -c redesign.js`). Bắt buộc duy trì cú pháp chuẩn xác 0 lỗi.

### 2.3. `app.js` (10.457 dòng)
Tệp mã nguồn chính của SunaChat, được phân thành 2 phân đoạn lớn:
- **Phân đoạn Agent Core** (dòng 3015-4304):
  - `StreamParser` (dòng 3020-3098): Máy trạng thái hữu hạn (FSM) lọc bỏ thẻ `<suna_tool_call>` khỏi văn bản hiển thị và gom cụm nội dung JSON của tool call.
  - Đối tượng `SunaAgent` hiện tại (dòng 3100-4275): Đăng ký công cụ nội bộ (`_registry`, `registerTool`, `validateParameters`), sinh tài liệu prompt (`generatePromptDocs`), điều phối thực thi tool call (`handleToolCalls`).
  - Cầu nối SunaHarness (dòng 4280-4301): Tự động phát hiện module `SunaHarness` và gọi `harnessModule.registerAciTools(SunaAgent)`.
- **Phân đoạn App & State Management** (dòng 4305-10457):
  - Khởi tạo State, quản lý bộ nhớ RAM, lưu trữ localStorage/Firestore, quản lý theme, lofi audio, mindmap iframe.
  - Hàm `formatMessage` (dòng 6298-6670): Hệ thống placeholder bảo vệ và render Markdown, KaTeX, Code, Thinking Blocks, Trajectory Drawer.
  - Hàm `sendMessage` và `generateAIResponse` (dòng 7697-8423): Điều phối hội thoại, gửi request qua SSE stream, vòng lặp tự động nối dài chuỗi token khi bị cắt (multi-turn auto-continuation), và kích hoạt đệ quy gọi công cụ `handleToolCalls`.
  - Hàm `sendWorkspaceMessage` và `autoApplyWorkspaceCode` (dòng 2060-2362): Đồng bộ mã nguồn trực tiếp vào Live Workspace.

---

## 3. Cơ Chế Quản Lý Tin Nhắn, Streaming, UI Rendering & Live Workspace

### 3.1. Cấu Trúc Dữ Liệu Tin Nhắn (Chat Message Schema)
Trong `app.js`, tin nhắn được định nghĩa như sau:
```javascript
// User Message (dòng 7760-7770)
const userMsg = {
  id: genId(),
  role: 'user',
  content: text,
  fileContent: fileContentText || '',
  images: compressedImages,
  files: files.map(f => ({ name: f.name, ext: f.ext, lang: f.lang, size: f.size })),
  timestamp: Date.now(),
  updatedAt: Date.now()
};

// Assistant Message (dòng 8274)
const assistantMsg = {
  id: genId(),
  role: 'assistant',
  content: assistantContent,
  trajectory: [], // Mảng chứa các bước suy luận / gọi công cụ
  timestamp: Date.now(),
  updatedAt: Date.now()
};
```
Mỗi phần tử trong mảng `trajectory` lưu trữ vết thực thi:
```javascript
{
  step: currentDepth,
  tool: toolName,
  thought: thoughtText,
  params: toolArgs,
  result: observationData,
  error: isError ? errorMessage : undefined,
  durationMs: executionDuration,
  timestamp: Date.now()
}
```

### 3.2. Chu Trình Streaming & Điều Tiết Hiển Thị (Throttled UI Rendering)
1. **Đọc luồng SSE**:
   Sử dụng `fetch` với `stream: true`, đọc qua `reader = res.body.getReader()` và `decoder = new TextDecoder()`.
2. **Lọc nội dung qua StreamParser**:
   Mỗi chunk ký tự delta được nạp vào `parser.parseChunk(delta)`. Máy trạng thái phân giải:
   - Trạng thái `TEXT`: Ký tự văn bản thông thường, được đưa vào `filteredText`.
   - Trạng thái `IN_TAG` / `IN_CONTENT` / `IN_END_TAG`: Bắt các thẻ `<suna_tool_call>...</suna_tool_call>` và trích xuất JSON tham số mà không để lộ thẻ thô ra giao diện người dùng.
3. **Điều tiết render (Throttling)**:
   Để tránh giật lag trình duyệt khi AI phản hồi với tốc độ cao, `app.js` (dòng 8222-8234) áp dụng cơ chế throttle thông qua `requestAnimationFrame`:
   ```javascript
   if (!bubbleEl._renderPending) {
     bubbleEl._renderPending = true;
     requestAnimationFrame(() => {
       const displayContent = parser ? parser.filteredText : assistantContent;
       bubbleEl.innerHTML = formatMessage(displayContent, true);
       const chatArea = $('#chat-area');
       const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 150;
       if (isNearBottom) chatArea.scrollTop = chatArea.scrollHeight;
       bubbleEl._renderPending = false;
     });
   }
   ```
4. **Phát hiện ngắt chuỗi & Nối tiếp tự động (Multi-Turn Continuation Engine)**:
   Hàm `isResponseTruncated` (dòng 2093-2131) kiểm tra 3 tầng:
   - Tầng 1: `finish_reason` của model (`length`, `max_tokens`, `truncated`).
   - Tầng 2: Tính chẵn lẻ của dấu backtick code fence (số lượng lẻ ```` ``` ```` => bị cắt ngang code).
   - Tầng 3: Thẻ HTML/SVG/Canvas chưa đóng (`html`, `script`, `style`, `svg`, `canvas`, `div`, `body`, `table`, `head`).
   Nếu phát hiện bị cắt, vòng lặp tự động gửi lượt truy vấn tiếp theo (`Tiếp tục chính xác từ chỗ vừa dừng...`) và ghép nối liền mạch bằng `stitchContinuationChunks` (dòng 2139-2200), loại bỏ trùng lặp và lời mở đầu thừa thãi.

### 3.3. Quy Trình Phân Giải & Định Dạng Giao Diện (`formatMessage`)
Hàm `formatMessage(text, isStreaming, trajectory)` (dòng 6298-6670) sử dụng kiến trúc **Placeholder Registry Thống Nhất** để đảm bảo không bị xung đột Markdown:
1. **Bước 0: Token hóa Thinking Blocks (`<think>` / `<thought>`)**:
   - Khối đã đóng (`Case 1`): Tạo wrapper `.thinking-block-wrapper.is-collapsed` với `data-streaming="false"`, hiển thị số dòng suy luận (`N dòng suy luận`), tiêu đề có icon `psychology`, và nội dung thu gọn có thể mở ra khi bấm `toggleThinkingBlock`.
   - Khối đang stream dở dang (`Case 2`): Tạo wrapper `.thinking-block-wrapper.is-streaming.is-open` với `data-streaming="true"`, hiệu ứng viền phát sáng `.is-pulsing`, tiêu đề `Đang suy nghĩ...`, và tự động mở sẵn nội dung để người dùng theo dõi suy nghĩ trực tiếp theo thời gian thực.
2. **Bước 1: Token hóa Fenced Code Blocks**:
   - `mermaid`: Chuyển thành skeleton loading khi đang stream, hoặc gọi thư viện Mermaid khi kết thúc.
   - `mindmap`: Nhúng iframe trực quan hóa sơ đồ tư duy.
   - Code thông thường: Bao bọc trong container có header hiển thị ngôn ngữ và nút Copy code.
3. **Bước 2: Token hóa KaTeX Math**: Render công thức toán học khối `$$...$$` hoặc nội dòng `$..$`.
4. **Bước 3: Token hóa Inline Code**: Bảo vệ các đoạn `` `code` ``.
5. **Bước 4: Phân giải cú pháp Markdown thông thường**: Headers, bold, italic, lists, quotes.
6. **Bước 5: Khôi phục Placeholders**: Điền lại toàn bộ HTML an toàn vào các vị trí token.
7. **Bước 6: Gắn Trajectory Drawer**:
   Nếu tham số `trajectory` tồn tại và có phần tử, gọi `renderTrajectoryView(trajectory)` (dòng 8589-8630) chèn thêm một badge `⚡ N bước suy luận · N ms ▼` ngay phía trên tin nhắn. Khi bấm vào, drawer mở rộng hiển thị timeline từng bước kèm tham số và kết quả quan sát.

### 3.4. Cơ Chế Đồng Bộ Trực Tiếp Live Workspace (Live Workspace Sync)
Cơ chế đồng bộ Live Workspace hoạt động theo luồng 2 chiều hoàn chỉnh:
1. **Chiều Assistant -> Workspace**:
   - Trong `sendWorkspaceMessage()` (dòng 2343-2347): Sau khi nhận phản hồi, hàm `extractWorkspaceCode(reply)` quét các khối code fenced.
   - Ưu tiên các khối runnable (`html`, `svg`, hoặc nội dung chứa `<canvas`, `<!DOCTYPE`, `<html`), bỏ qua các khối lệnh bash/json.
   - Hàm `autoApplyWorkspaceCode(extractedCode)` (dòng 2060-2083):
     - Gán trực tiếp giá trị vào `#artifact-editor-textarea.value = newCode`.
     - Kích hoạt sự kiện `editor.dispatchEvent(new Event('input', { bubbles: true }))` để thông báo cho các bộ lắng nghe.
     - Cập nhật `#artifact-iframe.srcdoc = newCode` để hiển thị bản xem trước tức thì.
     - Kích hoạt thông báo Toast thành công (`z-index: 10000`).
2. **Chiều VFS -> Workspace**:
   - Trong `suna_harness.js` (dòng 915-933): Bất cứ khi nào tác vụ của Agent (`replace_file_content` hoặc `writeFile`) thực hiện ghi vào tệp `index.html` trong không gian VFS, VFS tự động đồng bộ sang DOM thật:
     ```javascript
     if (path === 'index.html' && typeof document !== 'undefined') {
       const editor = document.getElementById('artifact-editor-textarea');
       const iframe = document.getElementById('artifact-iframe');
       if (editor) {
         editor.value = content;
         editor.dispatchEvent(new Event('input', { bubbles: true }));
       }
       if (iframe) iframe.srcdoc = content;
     }
     ```
3. **Chiều Workspace -> AI Context**:
   - Khi người dùng trò chuyện trong Workspace Chat, `sendWorkspaceMessage()` trích xuất nội dung từ `#artifact-editor-textarea.value` và chèn trực tiếp vào System Prompt:
     ```
     [MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:
     ```html
     ${currentCode}
     ```
     ```
     Nhờ đó, Agent luôn nắm bắt 100% ngữ cảnh mã nguồn mới nhất mà người dùng đang thao tác.

---

## 4. Phân Tích SunaHarnessVisualizer & Các Data Hook Cần Thiết Cho SunaAgent

Lớp `SunaHarnessVisualizer` (được triển khai tại `suna_harness.js` dòng 6841-7756) là một thành phần DOM hoàn chỉnh, hoạt động theo mô hình Event-Driven:

```javascript
const visualizer = new SunaHarness.SunaHarnessVisualizer({
  container: '#visualizer-container',
  harness: harnessInstance,
  theme: 'dark',
  activeTab: 'trajectory' // 'trajectory' | 'scorecard' | 'diff'
});
```

### 4.1. Ba Phân Hệ Hiển Thị Của SunaHarnessVisualizer
1. **Trajectory Tree Tab** (`_generateTrajectoryHtml`, dòng 7077-7169):
   - Hiển thị cây quyết định Trajectory dạng phân cấp thụt đầu dòng (`margin-left: ${depth * 24}px`).
   - Bộ lọc đa chiều:
     - Lọc theo Agent/Role (`root`, `worker`, `lead`, sub-agent id).
     - Lọc theo độ sâu (`Depth: 0` cho Root Harness, `Depth: 1+` cho Sub-agents).
     - Lọc theo trạng thái (`Pass Only`, `Fail Only`).
     - Tìm kiếm từ khóa (tìm trong `thought`, `tool`, `params`, `observation`).
   - Nút thao tác nhanh: `Expand All`, `Collapse All`, `Inspect Diff` (mở ngay tab Diff khi công cụ là `replace_file_content`).
2. **Benchmark Scorecard Tab** (`_generateScorecardHtml`, dòng 7171-7308):
   - 4 thẻ chỉ số KPI lớn:
     - **Success Rate ($SR$)**: Tỷ lệ hoàn thành nhiệm vụ vượt qua kiểm thử.
     - **Step Efficiency ($\eta$)**: Tỷ số giữa số bước tối ưu trên số bước thực tế.
     - **Fault Recovery Rate ($FRR$)**: Khả năng tự phục hồi khi bị inject lỗi Chaos.
     - **Tasks Completed**: Tổng số task hoàn thành trên 5 Tiers.
   - Bảng phân tích chi tiết 5 Tiers (Tier 1 Code Editing, Tier 2 Navigation, Tier 3 Algorithmic, Tier 4 Tool Chains, Tier 5 Chaos Resilience). Bấm vào từng hàng để mở rộng danh sách task con (`Task ID`, `Opt. Steps`, `Act. Steps`, `Duration`, `Status`).
3. **VFS Diff Viewer Tab** (`_generateDiffHtml`, dòng 7310-7480):
   - Chuyển đổi linh hoạt giữa 2 chế độ: **Unified Diff** và **Side-by-Side (Split)**.
   - Highlight cú pháp tô màu dòng thêm (+ xanh lá `#10b981`), dòng xóa (- đỏ `#ef4444`), và header phân đoạn `@@ -l,s +l,s @@`.
   - Nút `Copy Patch` sao chép nhanh chuỗi Git diff vào clipboard.

### 4.2. Yêu Cầu Data Hook Mà SunaAgent Phải Cung Cấp

Để SunaAgent hòa nhập hoàn hảo với `SunaHarnessVisualizer` và giao diện SunaChat, SunaAgent cần cung cấp các hook dữ liệu sau:

| Hook / Khả Năng | Mô Tả & Cơ Chế Hoạt Động | Giao Diện Nhận Dữ Liệu |
|---|---|---|
| **Real-Time Thought Streaming** | Trong pha Extended Thinking, Agent phát luồng suy nghĩ qua event `agent:thought_chunk` hoặc định dạng `<thought>...</thought>`. Visualizer và Chat bubble cập nhật ngay lập tức node đang chạy với trạng thái `is-streaming is-open`. | SunaChat Bubble (`.thinking-block-wrapper`) & Visualizer Trajectory Tree Node |
| **HITL: Pause** | Cho phép người dùng tạm dừng Agent trước khi bước sang turn công cụ kế tiếp. Agent lưu checkpoint tức thời và chuyển trạng thái `status = 'PAUSED'`. | Nút `Pause` trên Toolbar của Visualizer / Chat Bar |
| **HITL: Resume** | Người dùng cho phép Agent tiếp tục vòng lặp nhận thức từ trạng thái dừng hoặc từ một checkpoint cụ thể. | Nút `Resume` trên Toolbar của Visualizer |
| **HITL: Steer (Intervene)** | Khi đang Pause (hoặc giữa các turn), người dùng gõ chỉ thị can thiệp (ví dụ: "Đừng sửa file test, hãy sửa hàm parse trong utils.js"). Hook `agent.steer(guidanceText)` bơm chỉ thị này vào Working Memory với độ ưu tiên cao nhất cho turn suy luận tiếp theo. | Hộp thoại / input "Chỉ đạo Agent" trên Visualizer |
| **HITL: Rewind (Rollback)** | Khi người dùng thấy Agent đi sai hướng ở bước $N$, bấm "Tua lại bước $N$". Hook gọi `checkpointManager.rewind(N)`: VFS khôi phục về snapshot bước $N$, bộ nhớ RAM khôi phục về bước $N$, tệp trong `#artifact-editor-textarea` và `#artifact-iframe` được render lại chuẩn xác. | Nút "Rewind to this step" trên từng Trajectory Node |
| **Decision Tree Hook** | Cung cấp cây phân cấp từ `TrajectoryEngine.getHierarchicalTree()`. Cập nhật các node cha/con khi Agent kích hoạt Sub-harness qua `spawnSubHarness`. | Visualizer Trajectory Tree (`setTrajectory`) |
| **Benchmark Metrics Hook** | Trả về kết quả đánh giá qua `EvaluationRunner` để cập nhật bảng KPI Scorecard ($SR$, $\eta$, $FRR$). | Visualizer Scorecard (`setBenchmarkResults`) |

---

## 5. Phân Tích Kiến Trúc Dual Runtime (Browser & Node.js)

Một trong những yêu cầu sống còn của SunaAgent (R5 trong ORIGINAL_REQUEST) là:
> **Thuần JavaScript (Pure Vanilla JS/ES6+)**: Zero external npm dependencies, chạy mượt mà trên cả trình duyệt Web (Chrome, Edge, Firefox, Safari) và môi trường Node.js.

### 5.1. Mô Thức Đóng Gói Universal Module Definition (UMD)
SunaAgent cần áp dụng mẫu đóng gói tự thích ứng chuẩn mực:
```javascript
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Trình duyệt / Web Worker / globalThis
    const agent = factory();
    root.SunaAgent = agent;
    if (typeof window !== 'undefined') {
      window.SunaAgent = agent;
    }
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';
  
  // Implementation of SunaAgent...
  return SunaAgent;
}));
```

### 5.2. Bảng Đối Chiếu Nền Tảng (Browser vs. Node.js) & Giải Pháp Tương Thích

| Nhu Cầu Tính Năng | Môi Trường Browser (Trình Duyệt) | Môi Trường Node.js (Headless / Testing) | Giải Pháp Tương Thích Không Dependency |
|---|---|---|---|
| **Global Scope** | `window`, `self`, `globalThis` | `global`, `globalThis` | `const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);` |
| **Hashing / ID Gen** | `crypto.randomUUID()`, `crypto.subtle` | `require('crypto')` | Thử `crypto.randomUUID()` trước; fallback sang thuật toán PRNG nội bộ `Date.now() + '-' + Math.random().toString(36).slice(2, 9)`. Hashing chuỗi dùng `fastHash` (FNV-1a / Murmur fallback) như trong `suna_harness.js`. |
| **Lưu Trữ Checkpoint** | Native `indexedDB` qua `IndexedDbCheckpointStore` | `InMemoryIdbFallback` (Map in-memory) | Tự động kiểm tra `typeof indexedDB !== 'undefined'`. Nếu không có (Node.js), sử dụng `InMemoryIdbFallback` có sẵn trong `suna_harness.js` mà không gây lỗi. |
| **DOM & Sự Kiện** | DOM thực (`document.querySelector`, `dispatchEvent`, `new Event`) | Không có DOM (`document === undefined`) | Sử dụng `createMockElement` có sẵn trong `suna_harness.js` cho testing headless, hoặc bọc kiểm tra phòng vệ: `if (typeof document !== 'undefined') { ... }`. |
| **Streaming Reader** | `ReadableStream`, `TextDecoder` | `TextDecoder` (Node 11+), `Readable.from` | Cả trình duyệt hiện đại và Node.js 18+ đều hỗ trợ native `ReadableStream` và `TextDecoder`. Đối với Node < 18, hỗ trợ fallback xử lý chuỗi buffer trực tiếp. |
| **Event Emitter** | `EventTarget` hoặc Custom Listener Map | `require('events')` hoặc Custom Listener Map | Sử dụng cơ chế `listeners = new Map()` thuần JavaScript (`on`, `off`, `emit`) độc lập 100% với nền tảng. |
| **Quản Lý Bộ Nhớ** | Giới hạn dung lượng localStorage / IndexedDB | In-memory RAM buffer | Tự động phân tách: Working Memory (RAM), Episodic Memory (IndexedDB / Fallback Map), tự nén / tóm tắt ngữ cảnh khi vượt ngưỡng token. |

---

## 6. Thiết Kế Bản Vẽ Tích Hợp SunaAgent & Kiểm Toán Không Hồi Quy (Zero Regression)

### 6.1. Hợp Đồng Giao Diện SunaAgent (Interface Contract)
Để thay thế và nâng cấp đối tượng `SunaAgent` hiện tại ở `app.js` (dòng 3100) mà không làm hỏng bất kỳ test nào trong 1.226 bài test hiện tại, cấu trúc của `SunaAgent` cần bảo toàn toàn bộ API hiện có và mở rộng các năng lực mới:

```javascript
class SunaAgent {
  constructor(options = {}) {
    this.options = options;
    this.harness = options.harness || null;
    this.vfs = options.vfs || (this.harness ? this.harness.vfs : null);
    this.trajectoryEngine = options.trajectoryEngine || (this.harness ? this.harness.trajectory : null);
    this.checkpointManager = options.checkpointManager || (this.harness ? this.harness.checkpoint : null);
    
    // Cognitive State
    this.status = 'IDLE'; // 'IDLE' | 'THINKING' | 'PLANNING' | 'EXECUTING' | 'REFLECTING' | 'PAUSED' | 'ABORTED'
    this.workingMemory = { goal: '', plan: [], scratchpad: '', currentStep: 0 };
    this.episodicMemory = [];
    this.steeringDirectives = [];
    
    // Tool Registry & Parsers (Bảo toàn tương thích ngược 100%)
    this._registry = new Map();
    this.tools = {};
    this.StreamParser = StreamParser; // StreamParser hiện có
    this.MAX_RECURSION_DEPTH = 4;
    this.MAX_RESULT_LENGTH = 1500;
    this.MOODS_WHITELIST = ['calm', 'excited', 'sad', 'stressed', 'creative'];
    this.THEMES_WHITELIST = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'];
    
    // Event Emitter
    this._listeners = new Map();
  }

  // === TƯƠNG THÍCH NGƯỢC 100% VỚI APP.JS & TEST SUITES ===
  reset() { /* Hủy abort, làm sạch recursion depth */ }
  abort() { /* Kích hoạt cờ abort, dừng turn đang chạy */ }
  registerTool(def) { /* Đăng ký ACI tools */ }
  unregisterTool(name) { /* Hủy đăng ký */ }
  getTool(name) { /* Lấy định nghĩa tool */ }
  listTools() { /* Danh sách schema */ }
  validateParameters(schema, args) { /* Kiểm tra JSON Schema */ }
  generatePromptDocs() { /* Sinh hướng dẫn gọi công cụ trong prompt */ }
  handleToolCalls(rawCallsArray, context) { /* Phân giải và thực thi các cuộc gọi */ }

  // === NĂNG LỰC NÂNG CAO MỚI (OODA / ReAct++ & HITL) ===
  pause() {
    this.status = 'PAUSED';
    if (this.checkpointManager) this.checkpointManager.pause();
    this.emit('pause');
  }

  resume(fromStepIndex = null) {
    this.status = 'THINKING';
    if (this.checkpointManager) this.checkpointManager.resume(fromStepIndex);
    this.emit('resume', { fromStepIndex });
  }

  steer(guidanceText) {
    this.steeringDirectives.push({
      instruction: String(guidanceText).trim(),
      injectedAt: Date.now()
    });
    this.emit('steer', { guidanceText });
  }

  rewind(stepIndex) {
    if (!this.checkpointManager) throw new Error('CheckpointManager not attached');
    const chk = this.checkpointManager.rewind(stepIndex);
    // Tự động khôi phục Working Memory và thông báo tới UI
    this.emit('rewind', { stepIndex, checkpoint: chk });
    return chk;
  }

  // Grounded Self-Correction Loop
  diagnoseFailure(toolName, params, errorOutput) {
    // Phân tích stacktrace, lỗi compiler, lỗi schema
    // Đưa ra khuyến nghị sửa đổi cụ thể cho bước tiếp theo
  }
}
```

### 6.2. Các Ranh Giới Kiểm Toán Không Hồi Quy (Zero-Regression Boundaries)
1. **Bảo tồn toàn bộ 1.226 bài kiểm tra Mocha hiện có (`npm test`)**:
   - `test_thinking_blocks_stream_parser_adversarial.js`: Kiểm thử định dạng `<think>` và `<thought>`, luồng stream chunk, các trường hợp thẻ chưa đóng.
   - `test_dsh_react_loop_and_trajectory.js`: Kiểm thử vòng lặp ReAct, `MAX_RECURSION_DEPTH = 4`, `trajectory-chip`, `trajectory-drawer`.
   - `test_workspace_direct_sync_and_continuation.js` & `test_challenger_workspace_live_sync_adversarial.js`: Kiểm thử đồng bộ `#artifact-editor-textarea` và `#artifact-iframe.srcdoc`, trích xuất `extractWorkspaceCode`, sự kiện `input`.
   - `test_suna_harness.js`: Kiểm thử VFS, ACI tools, Trajectory, Checkpoint, Visualizer, Scorecard.
2. **Kiểm tra cú pháp tĩnh (`npm run check`)**:
   - Chạy `node -c app.js && node -c redesign.js && node -c suna_harness.js` đạt 0 lỗi cú pháp.
3. **Phòng vệ rò rỉ bộ nhớ & Quota**:
   - Không nạp tệp log lớn trực tiếp vào Context Window; sử dụng con trỏ định danh ngắn.
   - Không gọi `IndexedDB` liên tục khi streaming ký tự (áp dụng throttle/debounce).

---

## 7. Kết Luận & Khuyến Nghị Cho Nhóm Thực Thi (Implementation Team)

1. **Khả thi 100% không hồi quy**: Nền tảng hạ tầng hiện tại của SunaChat (`app.js`) và SunaHarness (`suna_harness.js`) đã có sẵn đầy đủ các khối xây dựng cốt lõi (`StreamParser`, `AciInterface`, `TrajectoryEngine`, `CheckpointManager`, `SunaHarnessVisualizer`, `IndexedDbCheckpointStore`). Việc kiến tạo **SunaAgent** là bước hợp nhất và nâng tầm các khối này thành một Agent nhận thức tự trị hoàn chỉnh.
2. **Chiến lược tích hợp**:
   - Triển khai `SunaAgent` dưới dạng lớp Universal Module độc lập, đóng gói sạch sẽ với 0 external dependencies.
   - Đảm bảo `app.js` có thể nạp `SunaAgent` nguyên vẹn ở cả browser và Node.js test suites.
   - Kết nối trực tiếp các hook HITL (`pause`, `resume`, `steer`, `rewind`) vào thanh công cụ của `SunaHarnessVisualizer` và bảng điều khiển SunaChat.
   - Đảm bảo tính minh bạch tối đa cho người dùng thông qua luồng Extended Thinking / Scratchpad dạng accordion thu gọn/mở rộng.

---
*Báo cáo được hoàn thành độc lập và đối soát thực tế trên mã nguồn bởi UI & Runtime Explorer (`explorer_chat_o6`).*
