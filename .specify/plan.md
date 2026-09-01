# Live Workspace & Core Subsystems Implementation Plan

Bản thiết kế kiến trúc kỹ thuật ("How"), cấu trúc thành phần, luồng xử lý dữ liệu và cơ chế bảo vệ an toàn cho hệ thống Suna Chat.

---

## 1. Cấu Trúc Giao Diện (HTML Markup - `index.html`)

Tái cấu trúc và mở rộng phân vùng `#artifacts-panel` thành hệ thống 3 bảng lập trình chuyên nghiệp:

```html
<!-- Bảng không gian làm việc Live Workspace -->
<div id="artifacts-panel" class="artifacts-panel" data-view="split">
  <!-- 1. Thanh kéo mở rộng cạnh trái -->
  <div id="workspace-left-handle" class="workspace-left-handle" title="Kéo để thay đổi kích thước"></div>

  <!-- 2. Header & Điều khiển -->
  <div class="artifacts-header">
    <div class="artifacts-header-left">
      <button id="btn-expand-workspace" class="btn-icon" title="Toàn màn hình">
        <span class="material-icons">open_in_full</span>
      </button>
      <span class="artifacts-title">Live Workspace</span>
    </div>
    <div class="view-toggle-group">
      <button class="view-toggle-btn active" data-view="split">Chia 3</button>
      <button class="view-toggle-btn" data-view="editor">Editor</button>
      <button class="view-toggle-btn" data-view="preview">Preview</button>
    </div>
    <div class="artifacts-actions">
      <button id="btn-refresh-artifact" class="btn-icon"><span class="material-icons">refresh</span></button>
      <button id="btn-copy-artifact" class="btn-icon"><span class="material-icons">content_copy</span></button>
      <button id="btn-download-artifact" class="btn-icon"><span class="material-icons">download</span></button>
      <button id="btn-collab-suna" class="btn-icon" title="Hỏi Suna trong Chat"><span class="material-icons">chat</span></button>
      <button id="btn-close-artifacts" class="btn-icon"><span class="material-icons">close</span></button>
    </div>
  </div>

  <!-- 3. Không gian nội dung 3 bảng -->
  <div class="artifacts-content">
    <!-- Cột 1: Trình soạn thảo mã nguồn & Toolbar -->
    <div id="artifact-editor-container" class="artifact-pane">
      <div class="workspace-editor-toolbar">
        <button id="btn-new-session" class="btn-sm"><span class="material-icons">add</span> Bài mới</button>
        <select id="select-session-template" class="select-sm">
          <option value="blank">Trang trống</option>
          <option value="html5">HTML5 Chuẩn</option>
          <option value="svg">SVG Canvas</option>
          <option value="tailwind">Tailwind Play</option>
        </select>
      </div>
      <textarea id="artifact-editor-textarea" spellcheck="false"></textarea>
    </div>

    <!-- Thanh chia tỷ lệ 1 (Editor <-> Preview) -->
    <div id="artifact-resizer-1" class="artifact-resizer" title="Kéo để chia tỷ lệ"></div>

    <!-- Cột 2: Iframe Sandbox xem trước -->
    <div id="artifact-preview-container" class="artifact-pane">
      <iframe id="artifact-iframe" sandbox="allow-scripts allow-modals allow-same-origin"></iframe>
    </div>

    <!-- Thanh chia tỷ lệ 2 (Preview <-> Assistant) -->
    <div id="artifact-resizer-2" class="artifact-resizer" title="Kéo để chia tỷ lệ"></div>

    <!-- Cột 3: Khung chat Suna AI Workspace Assistant -->
    <div id="artifact-chat-container" class="artifact-pane">
      <div class="workspace-chat-header">
        <span class="material-icons">smart_toy</span> Suna Assistant
      </div>
      <div id="workspace-chat-messages" class="workspace-chat-messages"></div>
      <div class="workspace-chat-input-container">
        <textarea id="workspace-chat-input" placeholder="Hỏi Suna về đoạn code này..."></textarea>
        <button id="btn-send-workspace-chat" class="btn-icon"><span class="material-icons">send</span></button>
      </div>
    </div>
  </div>
</div>
```

---

## 2. Thiết Kế Giao Diện & Bố Cục Responsive (CSS Styles - `styles.css`)

### Phân Bổ Tỷ Lệ 3 Cột (Split View)
- Trong chế độ `[data-view="split"]`:
  - `#artifact-editor-container`: `width: 35%`.
  - `#artifact-preview-container`: `width: 35%`.
  - `#artifact-chat-container`: `width: 30%`.
- Khi ở chế độ `[data-view="editor"]` hoặc `[data-view="preview"]`, pane mục tiêu nhận `width: 100%`, các pane và resizer còn lại tự động ẩn bằng `display: none !important`.

### Thanh Kéo & Hiệu Ứng Con Trỏ
- `.workspace-left-handle`: Chiều rộng 6px, đặt ở vị trí `left: 0`, con trỏ `ew-resize`, hiệu ứng hover phát sáng nhẹ viền cam đào (`rgba(232, 168, 124, 0.4)`).
- `.artifact-resizer`: Chiều rộng 4px, con trỏ `col-resize`, chuyển màu mờ khi rê chuột.

### Giao Diện Di Động & Màn Hình Nhỏ (`@media (max-width: 768px)`)
- `.artifacts-panel`: Chiều rộng cố định 100%, chiếm trọn màn hình.
- Ẩn hoàn toàn `.workspace-left-handle` và `.artifact-resizer` (`display: none`).
- Bố cục `.artifacts-content` chuyển sang **Vertical Stack** (`flex-direction: column`).
- Các pane (`#artifact-editor-container`, `#artifact-preview-container`, `#artifact-chat-container`) chuyển sang `width: 100% !important`, kích hoạt cuộn dọc (`overflow-y: auto`) và thiết lập chiều cao tối thiểu hợp lý (ví dụ: `min-height: 250px` - `350px`) để không bị che khuất nội dung.

---

## 3. Kiến Trúc Logic & Cơ Chế An Toàn (JavaScript Logic - `app.js`)

### 3.1. Quản Lý An Toàn Tương Tác Kéo Thả (`lockAllIframes` & `unlockAllIframes`)
- **Vấn đề:** Khi người dùng kéo chuột nhanh qua vùng Iframe, cửa sổ duyệt bên trong Iframe nuốt sự kiện `mousemove`/`mouseup`, dẫn đến hiện tượng "kẹt kéo" (dropped mouseup).
- **Giải pháp:**
  ```javascript
  function lockAllIframes() {
    document.querySelectorAll('iframe').forEach(iframe => {
      iframe.style.pointerEvents = 'none';
    });
  }
  function unlockAllIframes() {
    document.querySelectorAll('iframe').forEach(iframe => {
      iframe.style.pointerEvents = 'auto';
    });
  }
  ```
- **Kích hoạt:**
  - `mousedown` trên resizers -> gọi `lockAllIframes()`.
  - `mouseup` trên `document` và `window.blur` -> gọi `unlockAllIframes()`.

### 3.2. Chống Tích Tụ Sự Kiện Mạng (`_authOnlineListenerAttached`)
- Trong `initAuth()`, khai báo cờ bảo vệ `window._authOnlineListenerAttached`. Chỉ gắn lắng nghe `window.addEventListener('online', ...)` một lần duy nhất trong toàn bộ vòng đời ứng dụng, loại bỏ hoàn toàn sự tích lũy callback khi chuyển đổi trạng thái mạng.

### 3.3. Cơ Chế Proxy 3 Tầng Fallback (`window.fetchWithProxy`)
- Thống nhất hàm `fetchLinkContext` tái sử dụng `window.fetchWithProxy(url)`.
- Thực hiện tuần tự qua 3 dịch vụ Proxy nếu gặp lỗi mạng hoặc CORS:
  1. `corsproxy.io`
  2. `api.allorigins.win`
  3. `api.codetabs.com`

### 3.4. Vòng Đời Trợ Lý Suna AI An Toàn (`_workspaceAbortController`)
- Khởi tạo `_workspaceAbortController = new AbortController()` cho mỗi phiên gửi tin nhắn.
- Tích hợp bộ đếm `setTimeout` 45 giây để tự động hủy (`abort()`) nếu API không phản hồi kịp thời.
- Khối `try/catch/finally` đảm bảo phần tử Animated Typing Indicator (`#typing_<timestamp>`) luôn được dọn dẹp sạch khỏi DOM ngay cả khi xảy ra ngoại lệ mạng hoặc hủy request.

### 3.5. Đồng Bộ Hóa Suffix Lưu Trữ Cục Bộ
- Chuẩn hóa toàn bộ các điểm lưu trữ cấu hình trong `app.js` (`#btn-save-api`, `#btn-save-settings`, `#user-avatar-input`, `#btn-save-personality`, `#btn-save-font`) luôn sử dụng hàm `getStorageSuffix()`:
  ```javascript
  localStorage.setItem('suna_settings' + getStorageSuffix(), JSON.stringify(State.settings));
  ```

### 3.6. Dọn Dẹp Vòng Đời Module (Mindmap, Kanban, Lofi Player)
- **Mindmap:** Quản lý giao tiếp hai chiều an toàn qua `postMessage` giữa `index.html` và `mindmap.html` sandbox.
- **Kanban:** Dọn dẹp triệt để các class kéo thả (`.dragging`, `.drag-over`) trong sự kiện `dragend`.
- **Lofi Player:** Đóng gói trong đối tượng `SunaLofiPlayer` với cơ chế bắt lỗi phát âm thanh (`NotAllowedError`), chuyển đổi mood có kiểm tra danh sách trắng (`ALLOWED_MOODS`), và tự động fallback sang nguồn phát dự phòng khi URL âm thanh chính gặp sự cố.
