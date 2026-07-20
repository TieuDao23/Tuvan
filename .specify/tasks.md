# Live Workspace Upgrade Tasks

Danh sách các đầu việc chi tiết để thực hiện nâng cấp hệ sinh thái Live Workspace.

## Phase 1: HTML Markup (index.html)
- [ ] Thêm `#workspace-left-handle` vào đầu `#artifacts-panel`.
- [ ] Thêm nút `#btn-expand-workspace` vào `.artifacts-header`.
- [ ] Thêm thanh công cụ `.workspace-editor-toolbar` và template selector vào `#artifact-editor-container`.
- [ ] Nhân bản thanh chia tỷ lệ: đổi tên thanh cũ thành `#artifact-resizer-1` và thêm thanh mới `#artifact-resizer-2`.
- [ ] Thêm `#artifact-chat-container` và các thẻ con vào cấu trúc `.artifacts-content`.

## Phase 2: CSS Styles (styles.css)
- [ ] Thêm CSS cho `.workspace-left-handle` với chiều rộng 6px và cursor `ew-resize`.
- [ ] Thêm CSS cho `.workspace-editor-toolbar` và các nút bấm, select dropdown.
- [ ] Thêm CSS cho `.artifact-chat-container` và các thành phần chat con (bóng tin nhắn, input, nút gửi) đồng bộ Glassmorphism.
- [ ] Thêm CSS hỗ trợ định dạng co giãn 3 cột trong chế độ chia đôi (`data-view="split"`).

## Phase 3: JS Logic (app.js)
- [ ] Viết logic kéo mở rộng panel chính bằng `#workspace-left-handle`.
- [ ] Viết logic nút bấm phóng to/thu nhỏ toàn màn hình `#btn-expand-workspace`.
- [ ] Viết logic khởi tạo Template cho nút "+ Bài mới".
- [ ] Viết logic kéo thả hai thanh Resizers chia tỷ lệ nội bộ.
- [ ] Viết logic khung chat Workspace Assistant (gửi tin nhắn, gọi API, hiển thị tin nhắn kèm nút "Áp dụng vào Editor").

## Phase 4: Verification & Git
- [ ] Kiểm tra lỗi cú pháp biên dịch `node -c app.js`.
- [ ] Xác thực hiển thị thực tế trên trình duyệt.
- [ ] Commit các thay đổi và push lên GitHub.
