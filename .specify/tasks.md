# Live Workspace & Subsystems Upgrade Tasks

Danh sách các đầu việc chi tiết và tình trạng hoàn thành thực tế trong quá trình nâng cấp, bảo trì và đồng bộ hệ thống Suna Chat theo quy trình Spec-Driven Development (Spec-Kit SDD).

---

## Phase 1: Cấu Trúc Giao Diện (HTML Markup - `index.html`)
- [x] Thêm `#workspace-left-handle` vào đầu thẻ `#artifacts-panel` làm thanh kéo thay đổi độ rộng ngoài.
- [x] Thêm nút phóng to/thu nhỏ `#btn-expand-workspace` vào `.artifacts-header`.
- [x] Thêm thanh công cụ `.workspace-editor-toolbar`, nút "+ Bài mới" (`#btn-new-session`) và dropdown chọn mẫu (`#select-session-template`) vào `#artifact-editor-container`.
- [x] Tách và tạo thanh chia tỷ lệ đôi: `#artifact-resizer-1` (Editor <-> Preview) và `#artifact-resizer-2` (Preview <-> Assistant).
- [x] Thêm cấu trúc `#artifact-chat-container` cùng các thẻ con (header, danh sách tin nhắn, ô nhập liệu và nút gửi) cho Suna AI Assistant.

---

## Phase 2: Phong Cách & Bố Cục Responsive (CSS Styles - `styles.css`)
- [x] Thiết lập hệ thống biến CSS Token Zen Dark / Ink-Wash (`#0d0b14`, `#14121e`, `#1a1824`, `#e8a87c`, `#c0392b`).
- [x] Định dạng Glassmorphism cao cấp (`backdrop-filter: blur(20px)`, surface `rgba(20, 18, 30, 0.65)`, viền 1px highlight).
- [x] Cấu hình layout 3 bảng co giãn linh hoạt ở chế độ `data-view="split"` (35% Editor / 35% Preview / 30% Assistant).
- [x] Cấu hình ẩn/hiển thị tương ứng khi chuyển sang chế độ xem đơn `data-view="editor"` hoặc `data-view="preview"`.
- [x] Định dạng thanh kéo `.workspace-left-handle` (6px, con trỏ `ew-resize`) và `.artifact-resizer` (4px, con trỏ `col-resize`).
- [x] Bổ sung truy vấn đa phương tiện `@media (max-width: 768px)` cho thiết bị di động: ẩn resizer, chuyển 3 bảng sang dạng xếp chồng dọc (Vertical Stack 100% width) kèm cuộn độc lập mượt mà.
- [x] Đảm bảo tiêu chuẩn tương phản WCAG AA (>= 4.5:1) và chuyển động 60fps (chỉ animate `transform`, `opacity`, `background-color`).

---

## Phase 3: Logic Điều Khiển & An Toàn Tương Tác (JavaScript Logic - `app.js`)
- [x] Triển khai hàm `lockAllIframes()` và `unlockAllIframes()` để khóa `pointer-events` trên toàn bộ Iframe khi kéo thả resizer, giải quyết triệt để lỗi "kẹt chuột" (dropped mouseup).
- [x] Gắn lắng nghe `window.blur` để tự động mở khóa Iframe khi con trỏ chuột rời khỏi cửa sổ trình duyệt.
- [x] Triển khai kéo mở rộng panel chính bằng `#workspace-left-handle` với giới hạn kẹp an toàn 25% đến 100%.
- [x] Triển khai nút phóng to/thu nhỏ nhanh `#btn-expand-workspace` (chuyển đổi 60% <-> 100%).
- [x] Triển khai kéo thả độc lập 2 thanh chia tỷ lệ `#artifact-resizer-1` và `#artifact-resizer-2` với giới hạn an toàn tối thiểu 10% cho mỗi pane.
- [x] Triển khai logic nạp Template khởi tạo cho nút "+ Bài mới" và xóa trắng lịch sử hội thoại Workspace Assistant.
- [x] Triển khai logic khung chat Suna AI Assistant: tự động tiêm mã nguồn Editor vào System Instruction, gọi API không đồng bộ và hiển thị Animated Typing Indicator.
- [x] Triển khai hành động "Áp dụng vào Editor" (`applyWorkspaceCode`): mã hóa/giải mã an toàn chuỗi code qua URI encoding, cập nhật textarea, phát sự kiện `input` và làm mới Sandbox Iframe.

---

## Phase 4: Đồng Bộ State, Dọn Dẹp Sự Kiện & Fallback Mạng (Lifecycle & State Safeguards)
- [x] Đồng bộ hóa toàn bộ các điểm lưu trữ cấu hình người dùng sang định dạng khóa chuẩn `'suna_settings' + getStorageSuffix()`, bảo vệ cô lập dữ liệu giữa Guest và tài khoản xác thực.
- [x] Bổ sung cờ `_authOnlineListenerAttached` trong `initAuth()` ngăn chặn tích tụ trùng lặp sự kiện `window.ononline`.
- [x] Tái cấu trúc hàm `fetchLinkContext` để tái sử dụng bộ điều phối proxy 3 tầng `window.fetchWithProxy` (`corsproxy.io` -> `api.allorigins.win` -> `api.codetabs.com`).
- [x] Tích hợp `_workspaceAbortController` và bộ đếm Timeout 45 giây cho các yêu cầu gọi AI Assistant.
- [x] Kiểm tra và đảm bảo giải phóng bộ nhớ, dọn dẹp class kéo thả trong các module Mindmap, Kanban và Suna Lofi Player.

---

## Phase 5: Kiểm Thử Tự Động, Cú Pháp & Nghiệm Thu (Verification & Test Suite)
- [x] **Kiểm tra Cú pháp Tĩnh (Syntax Integrity):**
  - Chạy `node -c app.js` (Thành công - 0 lỗi cú pháp).
  - Chạy `node -c redesign.js` (Thành công - 0 lỗi cú pháp).
- [x] **Bộ Kiểm thử Tự Động Mocha (Visible & Hidden Tests):**
  - Chạy `npx mocha "tests/ui_redesign/**/*.js"` (17/17 tests passing - 100% pass rate).
  - Chạy `npm test` thông qua `package.json` test runner (17/17 tests passing).
- [x] **Kiểm tra Tương Thích & Tính Xác Thực (Forensic Integrity):**
  - Xác nhận toàn bộ logic hoạt động thật, không sử dụng code giả lập (facade/dummy) hay hardcode kết quả kiểm thử.
  - Bộ tài liệu Spec-Kit SDD (`constitution.md`, `specify.md`, `plan.md`, `tasks.md`) được đồng bộ chính xác 100% với mã nguồn thực tế.
