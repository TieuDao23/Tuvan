# Live Workspace Upgrade Tasks

Danh sách các đầu việc chi tiết để thực hiện nâng cấp hệ sinh thái Live Workspace.

## Phase 1: HTML Markup (index.html)
- [x] Thêm `#workspace-left-handle` vào đầu `#artifacts-panel`.
- [x] Thêm nút `#btn-expand-workspace` vào `.artifacts-header`.
- [x] Thêm thanh công cụ `.workspace-editor-toolbar` và template selector vào `#artifact-editor-container`.
- [x] Nhân bản thanh chia tỷ lệ: đổi tên thanh cũ thành `#artifact-resizer-1` và thêm thanh mới `#artifact-resizer-2`.
- [x] Thêm `#artifact-chat-container` và các thẻ con vào cấu trúc `.artifacts-content`.

## Phase 2: CSS Styles (styles.css)
- [x] Thêm CSS cho `.workspace-left-handle` với chiều rộng 6px và cursor `ew-resize`.
- [x] Thêm CSS cho `.workspace-editor-toolbar` và các nút bấm, select dropdown.
- [x] Thêm CSS cho `.artifact-chat-container` và các thành phần chat con (bóng tin nhắn, input, nút gửi) đồng bộ Glassmorphism.
- [x] Thêm CSS hỗ trợ định dạng co giãn 3 cột trong chế độ chia đôi (`data-view="split"`).

## Phase 3: JS Logic (app.js)
- [x] Viết logic kéo mở rộng panel chính bằng `#workspace-left-handle`.
- [x] Viết logic nút bấm phóng to/thu nhỏ toàn màn hình `#btn-expand-workspace`.
- [x] Viết logic khởi tạo Template cho nút "+ Bài mới".
- [x] Viết logic kéo thả hai thanh Resizers chia tỷ lệ nội bộ.
- [x] Viết logic khung chat Workspace Assistant (gửi tin nhắn, gọi API, hiển thị tin nhắn kèm nút "Áp dụng vào Editor").

## Phase 4: Verification & Git
- [x] Kiểm tra lỗi cú pháp biên dịch `node -c app.js`.
- [x] Xác thực hiển thị thực tế trên trình duyệt.
- [x] Commit các thay đổi và push lên GitHub.
