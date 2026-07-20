# Live Workspace Ecosystem Implementation Plan

Bản kế hoạch triển khai nâng cấp hệ sinh thái Live Workspace trong Suna Chat.

## 1. Thay đổi Giao diện (index.html)
- Tái cấu trúc `#artifacts-panel` thành cấu trúc 3 bảng:
  - Thêm `#workspace-left-handle` ở rìa ngoài cùng bên trái của panel để làm thanh kéo mở rộng panel.
  - Thêm nút `#btn-expand-workspace` vào góc trái thanh tiêu đề để thu nhỏ/phóng to 100% màn hình.
  - Thêm thanh công cụ `.workspace-editor-toolbar` lên trên đầu `#artifact-editor-textarea` chứa nút "+ Bài mới" và danh sách lựa chọn Template.
  - Thêm thanh chia tỷ lệ thứ hai `#artifact-resizer-2` giữa Preview và Chat panel.
  - Thêm `#artifact-chat-container` ở góc phải cùng chứa khung chat Suna Workspace Assistant.

## 2. Thay đổi Phong cách (styles.css)
- Viết CSS cho:
  - `.workspace-left-handle` để xử lý con trỏ kéo `ew-resize`.
  - `.workspace-editor-toolbar` làm thanh công cụ ngang tinh tế phía trên editor.
  - `.artifact-chat-container`, `.workspace-chat-messages`, `.workspace-chat-message`, và `.workspace-chat-input-container` theo đúng chuẩn giao diện Glassmorphism mờ của Suna Chat.
  - Thêm thuộc tính ẩn/hiển thị linh hoạt của các thanh chia tỷ lệ khi ở các chế độ xem khác nhau (`data-view`).

## 3. Thay đổi Logic (app.js)
- Triển khai kéo thả 2 thanh Resizers (`#artifact-resizer-1` và `#artifact-resizer-2`) độc lập.
- Triển khai kéo thả Resizer bên ngoài (`#workspace-left-handle`) để thay đổi độ rộng của toàn bộ panel chính.
- Triển khai nút mở rộng `#btn-expand-workspace` ở header.
- Triển khai logic nút "+ Bài mới" và bộ tải mẫu Template.
- Triển khai logic cho Khung chat Workspace Assistant:
  - Lắng nghe gửi tin nhắn qua nút gửi hoặc nhấn phím `Enter`.
  - Nạp tự động mã nguồn hiện tại trong Editor làm ngữ cảnh (system instruction).
  - Gửi request không đồng bộ lên API `/chat/completions` sử dụng model đang hoạt động.
  - Trình phân tích cú pháp tin nhắn Workspace: nhận diện code blocks và chèn nút **"Áp dụng vào Editor" (Apply to Editor)** với mã nguồn đã được giải mã URL.
