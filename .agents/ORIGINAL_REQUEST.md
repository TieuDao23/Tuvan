# Original User Request

## Initial Request — 2026-08-28T12:08:52Z

Task Description:
Tối giản toàn diện codebase Suna Chat (app.js, redesign.js, styles.css, mindmap.html, index.html) theo triết lý Ponytail Full (Senior Lazy Dev): loại bỏ boilerplate thừa, dead code, abstraction không cần thiết, tận dụng tối đa native platform APIs. Đảm bảo zero-regression và toàn bộ 597/597 tests cùng các integrity checks vượt qua 100%.

Requirements:
R1. Ponytail Codebase Simplification & De-bloating across JavaScript (app.js, redesign.js), CSS (styles.css), and HTML (index.html, mindmap.html).
- Replace custom helpers/abstractions with native browser & stdlib APIs.
- Eliminate duplicate or dead variables, functions, CSS rules.
- Reduce LOC while maintaining 100% correctness and maintainability.

R2. Zero-Regression Behavior & Functional Parity:
- Autonomous Multi-Turn Continuation Chaining Engine (stream chunk stitching, multi-tier truncation detection, abort safety, token ceiling maximization).
- Live Workspace Sync & 3-Pane Resizers (pointer lock, boundary clamping, auto-apply code, toast notifications).
- Zen Theme, Lofi Player, Mindmap, Storage Quota & User Isolation, Modals, Keyboard Accessibility.

R3. Strict Verification & Integrity Compliance:
- node -c app.js && node -c redesign.js (0 syntax errors).
- CSS hygiene: balanced braces {} and .toast-container z-index: 10000.
- python run_verification.py passes 100% (597/597 tests green).

## Follow-up — 2026-09-04T15:52:22Z

Tích hợp kiến trúc và bộ công cụ DeepSeek Harness (dsh) vào SunaChat (SunaAgent), biến SunaChat thành một Autonomous Agent thông minh với hệ sinh thái công cụ plugin, sandbox thực thi mã, quản lý tệp ảo, truy vết suy luận (Trajectory View) và vòng lặp ReAct đa bước giải quyết bài toán phức tạp.

Working directory: d:\Suna Chat
Integrity mode: development
Requested team: Full Team (Architecture, Implementer, QA)

## Reference Material
- DeepSeek Harness (`@deepseek-ai/dsh` / `github.com/deepseek-ai/deepseek-harness`)
- Kiến trúc "Everything is a Plugin" (Cordis kernel), Agent = Model + Harness, Trajectory Log & Tool Sandbox
- Hệ sinh thái plugin cộng đồng `dsh-plugin`: `dsh-sandbox`, `dsh-at-file`, `dsh-tabular-calc`, `dsh-mnemon`, `dsh-vision-toolkit`, `dsh-session`

---

## Phân Tích Chuyên Sâu Các Plugin & Giá Trị Khai Thác

| Plugin / Tool Harness | Nguyên Lý Kỹ Thuật (How it works) | Đột Phá Trí Tuệ Cho SunaChat (Why it makes Suna 10x smarter) | Tích Hợp Vào SunaChat |
| :--- | :--- | :--- | :--- |
| **1. `dsh-sandbox`**<br>*(Code & Math Runner)* | Chạy mã JS/Toán học trong môi trường sandbox cô lập an toàn trên trình duyệt, bắt lỗi cú pháp & runtime. | **Chấm dứt tính toán nhẩm sai & Hallucination.** AI tự viết code để giải phương trình, tính xác suất, xử lý logic ma trận với độ chính xác 100%. Tự động sửa lỗi (Self-Correction loop) khi code báo lỗi trước khi trả lời người dùng. | `SunaAgent.tools.sandbox_exec`: Chạy code an toàn, trả về kết quả số học / chuỗi chuẩn xác. |
| **2. `dsh-at-file` & Virtual FS**<br>*(Workspace File System)* | Cung cấp virtual file system trong browser (in-memory / localStorage) hỗ trợ cơ chế `@file`, đọc/ghi/vá file. | **Mở rộng khả năng từ 1 file đơn lẻ thành một Project hoàn chỉnh.** AI có thể quản lý cây thư mục ảo (`index.html`, `style.css`, `app.js`), tự đọc file liên quan và áp dụng patch diff (`fs_patch`) tối ưu token thay vì viết lại cả file lớn. | `SunaAgent.tools.fs_read`, `fs_write`, `fs_list`, `fs_patch`: Đồng bộ trực tiếp với 3-Pane Live Workspace. |
| **3. `dsh-tabular-calc`**<br>*(Data Science Engine)* | Parser và xử lý dữ liệu cấu trúc (CSV, TSV, JSON tabular data), tính toán thống kê (Mean, Median, StdDev, Min/Max, Filter, Sort). | **Xử lý số liệu thực thụ như một Data Scientist.** Người dùng gửi file dữ liệu hoặc bảng số liệu lớn, AI có thể tự động lọc, trích xuất đặc trưng và tính toán phân tích chuyên sâu mà không bị giới hạn token cửa sổ ngữ cảnh. | `SunaAgent.tools.analyze_tabular`: Tích hợp trực tiếp với bộ khung `table-responsive-wrapper` và nút 1-Click CSV Export hiện có. |
| **4. `dsh-vision-toolkit` & Diagram**<br>*(Visual Analytics & SVG)* | Chuyển đổi dữ liệu và khái niệm logic thành biểu đồ trực quan (Flowchart, Sequence, SVG Vector, Mindmap JSON cấu trúc). | **Trực quan hóa tư duy tức thì.** Biến các câu hỏi phức tạp (thuật toán, quy trình sinh học, sơ đồ kiến trúc phần mềm) thành hình vẽ trực quan sinh động, có thể zoom soi chi tiết bằng SVG modal vừa phát triển. | `SunaAgent.tools.visualize_diagram`: Sinh SVG vector diagram và sơ đồ cây tư duy tương thích với engine Mindmap. |
| **5. `dsh-mnemon`**<br>*(Semantic Memory & Retrieval)* | Truy vấn ngữ cảnh dài hạn theo từ khóa và phân loại dữ kiện (user preferences, facts, project history). | **Ghi nhớ sâu sắc và cá nhân hóa vượt bậc.** AI nhớ phong cách lập trình, sở thích cá nhân, những bài toán đã giải của người dùng qua nhiều phiên mà không cần người dùng phải nhắc lại trong mỗi prompt. | `SunaAgent.tools.memory_query`, `memory_store`: Kết nối kho `State.memory.facts` và Firestore. |
| **6. `dsh-session`**<br>*(Trajectory Trace & ReAct)* | Lưu vết toàn bộ chuỗi hành động: `Think -> Tool Call -> Observation -> Answer` thành nhật ký tuần tự có thể kiểm tra (Explainable AI). | **Minh bạch và có khả năng giải trình cao.** Người dùng theo dõi được AI đã tra cứu những gì, tính toán ở đâu, tại sao lại đưa ra kết luận đó qua thanh Trajectory View gập/mở tinh tế. | Giao diện Trajectory Chip & Collapse Drawer trong bong bóng tin nhắn của SunaChat. |
| **7. `dsh-market`**<br>*(Modular Tool Registry)* | Kiến trúc "Everything is a Plugin" (Cordis kernel). Tách rời từng công cụ thành plugin độc lập có thể bật/tắt động. | **Hệ thống siêu nhẹ và mở rộng vô hạn.** Thêm 10 hay 50 tool mới mà không làm nặng hay rối loạn mã nguồn lõi của SunaChat. Cho phép bật/tắt tool theo từng ngữ cảnh. | `SunaAgent.registerTool()`, `SunaAgent.unregisterTool()`, `SunaAgent.listTools()`. |

---

## Requirements

### R1. DeepSeek Harness-Style Plugin & Tool Registry Architecture
- Nâng cấp `SunaAgent.tools` thành một hệ thống **Modular Tool Registry** chuẩn hóa.
- Mỗi công cụ khai báo định danh (`name`), mô tả chức năng (`description`), JSON schema tham số (`parameters`), và hàm xử lý bất đồng bộ (`execute`).
- Hỗ trợ cơ chế đăng ký động (`registerTool`, `unregisterTool`, `listTools`) cho phép mở rộng không giới hạn mà không sửa đổi core orchestrator.

### R2. Core Tool Harness Suite (Bộ Công Cụ Thông Minh Chuyên Sâu)
Tích hợp bộ 5 công cụ chuẩn theo phân tích ở bảng trên, chạy an toàn ngay trên trình duyệt (client-side first):
1. **Code & Math Sandbox Runner (`sandbox_exec`)**: Chạy mã JS, toán học, regex, thuật toán trong sandbox an toàn, trả về kết quả số học / chuỗi chuẩn xác.
2. **Web Context & Knowledge Fetcher (`web_search_context`, `fetch_page_summary`)**: Tìm kiếm và trích xuất dữ liệu web thực tế hỗ trợ câu trả lời.
3. **Virtual Workspace File System (`fs_read`, `fs_write`, `fs_list`, `fs_patch`)**: Thao tác tệp ảo (đọc/ghi/sửa/danh sách file) đồng bộ với 3-Pane Live Workspace.
4. **Deep Memory & Fact Retrieval (`memory_query`, `memory_store`)**: Truy vấn và lưu trữ ngữ cảnh sâu dài hạn.
5. **Data & Visual Analytics Tool (`visualize_diagram`, `analyze_tabular`)**: Tự động sinh sơ đồ thị giác (SVG vector) và phân tích dữ liệu bảng tính CSV/JSON.

### R3. Autonomous Multi-Step ReAct Loop & Trajectory View
- Cho phép SunaAgent thực hiện chu trình **Think -> Action (Tool Call) -> Observation -> Next Action/Final Answer** liên tục nhiều bước (với giới hạn an toàn `MAX_RECURSION_DEPTH`).
- Ghi nhận toàn bộ tiến trình vào **Trajectory Log** (nhật ký bước suy luận, tool gọi, tham số, kết quả quan sát) có thể thu gọn/mở rộng trực quan trên giao diện bong bóng tin nhắn (Trajectory View theo phong cách DeepSeek Harness).

### R4. Giao Diện Tương Tác & Chỉ Báo Sống Động
- Hiển thị widget/chip trạng thái sống động khi SunaAgent đang gọi công cụ (ví dụ: `Đang tính toán trong sandbox...`, `Đang phân tích bảng dữ liệu...`).
- Trực quan hóa kết quả tool ngay trong nội dung tin nhắn một cách tinh tế, thẩm mỹ (theo chuẩn Zen Glassmorphic UI của SunaChat).

## Acceptance Criteria

### Tính Đúng Đắn & Vận Hành Độc Lập
- [ ] Tất cả các công cụ mới chạy mượt mà trên môi trường client-side của trình duyệt, có cơ chế try/catch và timeout an toàn.
- [ ] Bộ điều phối `SunaAgent` tự động nhận diện thẻ gọi tool `<suna_tool_call>` hoặc cấu trúc JSON tool call và kích hoạt đúng tool tương ứng.
- [ ] Vòng lặp đệ quy tool gọi có cơ chế guard chống lặp vô tận và tự phục hồi khi tool báo lỗi.
- [ ] Nhật ký Trajectory hiển thị đẹp mắt, cho phép người dùng mở xem chi tiết các bước xử lý ngầm của AI.

### Kiểm Thử & Tính Tương Thích Toàn Diện
- [ ] Viết test suite chuyên sâu (Mocha/Node.js) bao phủ 100% các công cụ mới và luồng ReAct loop.
- [ ] Vượt qua kiểm tra cú pháp tĩnh `npm run check` (0 lỗi `node -c`).
- [ ] Không làm phá vỡ bất kỳ tính năng hiện tại nào: toàn bộ 644 tests hiện có tiếp tục PASS 100%.

