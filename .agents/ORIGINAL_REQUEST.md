# Original User Request

## 2026-09-07T13:33:27Z

# Suna Agent Harness — Kiểm Tra & Bổ Sung Năng Lực Nâng Cao (Sub-harness, Unified Diff, Schema Validator & UI Visualizer)

Rà soát toàn diện, phát hiện các điểm khuyết thiếu và nâng cấp kiến trúc cho Suna Agent Harness (SunaHarness) nhằm tiệm cận các hệ thống AI Agent Harness hàng đầu thế giới (OpenHands, SWE-agent, LangGraph). Bổ sung cơ chế điều phối Đa-Agent (Sub-harness Delegation), bộ sinh Unified Git Diff chuẩn mực cho VFS, bộ xác thực tham số chuẩn JSON Schema cho các công cụ ACI, và giao diện UI Visualizer trực quan hóa cây Trajectory và bảng điểm Benchmark Scorecard trên SunaChat với cam kết 100% không hồi quy (Zero Regression).

Working directory: d:\Suna Chat
Integrity mode: development

## Requirements

### R1. Điều Phối Đa-Agent & Phân Tầng Sub-harness (Multi-Agent Sub-harness Delegation)
- **Cơ chế khởi tạo Sub-harness phân cấp**: Cho phép Parent Harness sinh ra các Child Sub-harness độc lập (spawnSubHarness({ role, budget, vfsWorkspaceMode })) với các chế độ không gian làm việc linh hoạt (share dùng chung VFS, clone nhân bản độc lập, hoặc ranch rẽ nhánh với khả năng merge ngược lại).
- **Kênh truyền thông điệp & Điều phối sự kiện (Inter-Harness Event Bus)**: Thiết lập kênh truyền nhận thông điệp có cấu trúc hai chiều giữa Parent và Sub-harness, hỗ trợ gửi chỉ thị tiếp theo, giám sát tiến độ và dừng khẩn cấp từ harness cha.
- **Tổng hợp kết quả & Nối dòng Trajectory (Trajectory Stitching)**: Tự động đính kèm toàn bộ chuỗi sự kiện 	hought -> action -> observation của sub-harness con vào dòng trajectory tổng thể của harness cha, hiển thị rõ ràng quan hệ phân cấp cây (hierarchical tree representation).

### R2. Bộ Sinh Unified Git Diff & Xác Thực Tham Số JSON Schema (Unified Diff & Schema Validation)
- **Bộ sinh Unified Git Diff chuẩn mực cho VFS (VfsDiffEngine)**: Tạo ra chuỗi diff chuẩn Git (--- a/path\n+++ b/path\n@@ -l,s +l,s @@) khi so sánh giữa 2 phiên bản tệp tin, giữa 2 snapshot VFS, hoặc trước/sau khi thực hiện lệnh phẫu thuật code (eplace_file_content). Hỗ trợ Agent xem trước diff trước khi xác nhận lưu và giúp người dùng kiểm toán thay đổi trực quan.
- **Bộ xác thực tham số chuẩn JSON Schema (AciSchemaValidator)**: Tích hợp tầng xác thực schema nghiêm ngặt cho toàn bộ các công cụ ACI (iew_file, eplace_file_content, grep_search, ind_by_name, list_dir, un_sandboxed_command). Tự động phát hiện lỗi sai kiểu dữ liệu, thiếu trường bắt buộc hoặc vượt ngưỡng giới hạn ngay lập tức, trả về chẩn đoán lỗi có cấu trúc chuẩn xác trước khi gọi logic VFS.

### R3. Giao Diện Trực Quan Hóa UI Visualizer & Lưu Trữ Bền Vững Checkpoint (Interactive Visualizer & Persistence)
- **Component trực quan hóa DOM (SunaHarness UI Visualizer)**: Xây dựng module hiển thị giao diện trực quan nhúng trong SunaChat, cho phép người dùng mở xem:
  - Cây chuỗi sự kiện Trajectory (Thought, Action, Tool Params, Output, Duration, Token Cost) với khả năng lọc theo cấp độ hoặc sub-agent.
  - Bảng điểm Benchmark Scorecard trực quan với biểu đồ đo lường Success Rate ($), Step Efficiency ($\eta$) và Fault Recovery Rate ($).
  - Trình hiển thị Diff trực quan (Side-by-side hoặc Unified Diff với màu sắc highlight cú pháp).
- **Lưu trữ Checkpoint bền vững vào IndexedDB**: Cung cấp khả năng xuất và nhập toàn bộ trạng thái snapshot VFS cùng lịch sử Checkpoint vào IndexedDB (suna_harness_checkpoints_<uid>) để người dùng có thể tải lại trang hoặc mở lại phiên làm việc trong tương lai mà không bị mất dữ liệu.

### R4. Bộ Kiểm Thử E2E Toàn Diện, Kiểm Thử Đối Kháng & Không Hồi Quy (Testing & Zero Regression)
- **Bộ test tự động chuyên biệt mở rộng**: Mở rộng 	ests/test_suna_harness.js bao phủ đầy đủ tất cả các tính năng mới bổ sung:
  - Kiểm thử Sub-harness delegation (spawn, message passing, merge nhánh VFS, tra cứu cây trajectory).
  - Kiểm thử Unified Diff (so sánh dòng thêm/xóa/sửa, bảo toàn ký tự khoảng trắng và UTF-8 tiếng Việt có dấu).
  - Kiểm thử JSON Schema Validator (kiểm tra kiểu dữ liệu, thiếu required properties, enum bounds).
  - Kiểm thử Checkpoint IndexedDB persistence và UI Visualizer DOM rendering.
- **Kiểm thử đối kháng (Adversarial Fuzzing)**: Kiểm thử các tình huống đệ quy sâu (Deep Sub-harness nesting $\ge 5$), tấn công schema injection, diff trên tệp tin cực lớn (>10,000 dòng).
- **Bảo toàn 100% hệ thống SunaChat**: Vượt qua 100% tất cả 982 bài test hiện có của dự án (
pm test), 0 lỗi cú pháp JavaScript (
ode -c), và hoàn tất toàn bộ kiểm thử trong un_verification.py đạt màu xanh.

## Acceptance Criteria

### Điều Phối Đa-Agent & Sub-harness
- [ ] Parent Harness có thể sinh ra ít nhất một Child Sub-harness với ngân sách turns/tokens riêng biệt và chế độ phân vùng VFS (share, clone, ranch).
- [ ] Kênh Event Bus hỗ trợ truyền thông điệp hai chiều an toàn giữa Parent và Child Sub-harness.
- [ ] Toàn bộ chuỗi sự kiện Trajectory của Child Sub-harness được đính kèm chuẩn xác vào Trajectory của Parent dưới dạng cấu trúc cây phân cấp (hierarchical tree).

### Unified Diff & Schema Validation
- [ ] VfsDiffEngine tạo ra chuỗi Unified Diff chuẩn mực tuân thủ định dạng Git patch cho cả tệp tin đơn lẻ và toàn bộ không gian làm việc giữa 2 snapshot.
- [ ] AciSchemaValidator phát hiện và từ chối các tham số công cụ không hợp lệ với thông báo lỗi chẩn đoán rõ ràng trước khi thực thi lệnh.
- [ ] Thuật toán diff xử lý chính xác các ký tự đặc biệt và ký tự Unicode tiếng Việt có dấu mà không gây lỗi mã hóa.

### Giao Diện Visualizer & Checkpoint Persistence
- [ ] Component UI Visualizer có thể render danh sách sự kiện Trajectory và bảng Benchmark Scorecard trên môi trường DOM trình duyệt.
- [ ] Checkpoint snapshot có thể được serialize và lưu trữ/khôi phục từ IndexedDB hoặc localStorage phân vùng theo UID.
- [ ] Trình xem Diff hiển thị rõ ràng các dòng thêm (+ xanh) và xóa (- đỏ).

### Độ Ổn Định & Không Hồi Quy
- [ ] Toàn bộ 982 bài test Mocha hiện có cộng với các bài test mới cho các tính năng bổ sung đều vượt qua 100% (
pm test).
- [ ] 
pm run check (hoặc 
ode -c app.js && node -c redesign.js && node -c suna_harness.js) không có bất kỳ lỗi cú pháp nào.
- [ ] python run_verification.py vượt qua toàn bộ các bài test, không có hồi quy tính năng.
## 2026-09-07T14:26:47Z

[CHECKPOINT_HOLD_ORDER] Người dùng đã ra lệnh lưu cột mốc dữ liệu của 3 subagents ngay lập tức và tạm dừng chờ lệnh tiếp theo. Toàn bộ bản thiết kế M2 của explorer_m2_1, explorer_m2_2, explorer_m2_3 đã được lưu vào CHECKPOINT_3_SUBAGENTS.md. Hãy giữ nguyên trạng thái hiện tại, tạm hoãn việc chỉnh sửa suna_harness.js của worker_m2 cho đến khi người dùng có lệnh tiếp tục.
## 2026-09-07T14:31:44Z

[RESUME_ORDER] Người dùng đã ra lệnh  Tiếp tục!. Hãy giải phóng lệnh đóng băng, kích hoạt worker_m2 tiếp tục công việc dang dở của Milestone 2 (tích hợp VfsDiffEngine và AciSchemaValidator vào suna_harness.js) và chuyển tiếp qua các Milestone tiếp theo. Bảo đảm 100% zero regression trên toàn bộ 1.034 tests.
## 2026-09-07T15:33:18Z

[CHECKPOINT_HOLD_ORDER] Người dùng đã ra lệnh lưu cột mốc dữ liệu của 3 subagents ngay lập tức và tạm dừng chờ lệnh tiếp theo. Hãy ghi nhận lệnh tạm dừng vào ORIGINAL_REQUEST.md, giữ nguyên trạng thái hiện tại của worker_m3, explorer_m3_1 và orchestrator_2, tạm hoãn mọi thao tác ghi sửa mới cho đến khi có lệnh tiếp tục từ người dùng.

## 2026-09-07T16:12:49Z

# SunaAgent — Siêu Tác Nhân Tự Trị Độc Quyền Cho Hệ Sinh Thái SunaChat & SunaHarness

Thiết kế và xây dựng **SunaAgent** — Agent tự trị độc quyền và tối thượng cho SunaChat, được thiết kế 'may đo' tương thích tuyệt đối với SunaHarness. Kế thừa và hợp nhất những tinh hoa mạnh mẽ nhất từ **HermesAgent** (Function Calling đanh thép & Structured Reasoning), **Claude Agent** (Extended Thinking, Scratchpad & Cẩn trọng chi tiết) và **Codex Agent** (Code Generation chuẩn xác, Phẫu thuật code & Test-Driven Self-Correction), chạy thuần túy bằng Vanilla JavaScript trên cả môi trường Trình duyệt và Node.js.

Working directory: d:\Suna Chat
Integrity mode: development

## Requirements

### R1. Bộ Não Nhận Thức Đa Tầng & Chu Trình Suy Luận Mở Rộng (Extended Thinking & Multi-Stage Cognitive Brain)
- **Chu trình nhận thức khép kín (OODA / ReAct++)**: Triển khai chu trình khép kín: Phân tích mục tiêu (Goal Decomposition) -> Kế hoạch đa tầng (Hierarchical Planning) -> Suy luận mở rộng (Extended Thinking / Scratchpad) -> Lựa chọn & Sinh tham số công cụ (Tool Calling) -> Quan sát & Tự phản tỉnh (Observation Reflection).
- **Bộ nhớ ngữ cảnh & Nén trạng thái thông minh (Smart Context & Working Memory)**: Quản lý cửa sổ ngữ cảnh hiệu quả, phân tách rõ ràng giữa Working Memory (trạng thái tức thời), Episodic Memory (các bước đã qua) và System Instructions. Tự động tóm tắt/nén khi ngữ cảnh tiệm cận giới hạn token mà không làm mất thông tin quyết định.
- **Cơ chế Structured Output & Tool Call Parsing chuẩn mực**: Hỗ trợ bóc tách cú pháp gọi công cụ linh hoạt (cả Native Function Calling JSON và cú pháp XML/Markdown tags kiểu Claude/Hermes) với khả năng tự phục hồi khi mô hình sinh chuỗi JSON bị lỗi format.

### R2. Tương Thích Hoàn Hảo & Tận Dụng Trọn Vẹn Nền Tảng SunaHarness
- **Tích hợp sâu với SunaHarness Runtime**: Kết nối trực tiếp với `HarnessController`, `VfsSandbox`, và toàn bộ 6 công cụ chuẩn ACI (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`).
- **Tuân thủ nghiêm ngặt AciSchemaValidator**: Tự động chuẩn hóa tham số đầu vào trước khi gọi ACI, bắt giữ các cảnh báo schema và tự điều chỉnh tham số nếu có sai lệch.
- **Ghi vết Trajectory phân cấp & Checkpoint Replay**: Đồng bộ toàn bộ chuỗi sự kiện `thought -> plan -> action -> observation -> reflection` vào hệ thống Trajectory bất biến của SunaHarness. Cho phép tua lại trạng thái (Checkpoint Rollback) khi nhận thấy hướng đi sai lệch.
- **Khả năng hoạt động đa tác nhân (Multi-Agent Sub-Harness Inter-op)**: Tương thích với `InterHarnessEventBus`, có thể đóng vai trò Lead Agent điều phối các Sub-Agent con hoặc nhận chỉ thị từ Harness cha với giới hạn đệ quy an toàn.

### R3. Khả Năng Phẫu Thuật Code Chuẩn Codex & Tự Sửa Lỗi Thực Chứng (Code Surgery & Grounded Self-Correction)
- **Phẫu thuật code độ chính xác tuyệt đối (Surgical Code Replacement)**: Tạo ra các khối thay thế (`replace_file_content`) chuẩn xác từng ký tự, giữ nguyên thụt đầu dòng (indentation) và bảo toàn 100% tiếng Việt UTF-8 có dấu.
- **Sinh Git Diff chuẩn mực**: Kết nối với `VfsDiffEngine` để kiểm tra trước (preview) các thay đổi dưới dạng Unified Git Diff trước khi xác nhận ghi đè vào VFS.
- **Vòng lặp tự sửa lỗi thực chứng (Grounded Diagnostic Loop)**: Tự động phân tích stacktrace, thông báo lỗi cú pháp từ `node -c` hoặc lỗi kiểm thử từ `mocha` do SunaHarness trả về để lập luận tìm nguyên nhân gốc (Root Cause) và tự sửa lỗi, ngăn chặn triệt để hiện tượng lặp vô ích (Zero-Progress).

### R4. Tích Hợp Giao Diện SunaChat, Live Workspace & Điều Khiển Người Dùng (Human-in-the-Loop)
- **Luồng suy nghĩ thời gian thực (Real-time Thought Streaming)**: Hiển thị minh bạch khối Extended Thinking / Scratchpad cho người dùng trên giao diện SunaChat và Live Workspace dưới dạng khối thu gọn/mở rộng trực quan.
- **Can thiệp thời gian thực (Human-in-the-loop Controls)**: Cung cấp các hook cho phép người dùng Tạm dừng (Pause), Tiếp tục (Resume), Chèn chỉ thị định hướng (Steer/Intervene), hoặc Yêu cầu hoàn tác (Undo/Rewind) từng bước thực thi.
- **Tương thích hoàn toàn SunaHarnessVisualizer**: Cung cấp dữ liệu trực quan cho component visualizer hiển thị sơ đồ cây quyết định, bảng chỉ số năng lực ($SR, \eta, FRR$) và lịch sử các phiên can thiệp.

### R5. Độc Lập Nền Tảng (Dual Runtime), Hiệu Năng Cao & Zero Regression
- **Thuần JavaScript (Pure Vanilla JS/ES6+)**: Zero external npm dependencies, chạy mượt mà trên cả trình duyệt Web (Chrome, Edge, Firefox, Safari) và môi trường Node.js.
- **Bảo toàn 100% hệ thống SunaChat**: Đảm bảo không làm suy giảm hoặc phá vỡ bất kỳ tính năng hiện tại nào của SunaChat (Authentication, Multi-Account Data Isolation, Cloud Sync, Live Workspace Sync, Lofi Player, Mindmap).
- **Bộ kiểm thử toàn diện**: Xây dựng bộ test riêng biệt bao phủ đầy đủ các năng lực suy luận, gọi công cụ, xử lý lỗi và tương thích với SunaHarness.

## Acceptance Criteria

### Năng Lực Suy Luận & Gọi Công Cụ
- [ ] SunaAgent thực hiện đầy đủ chu trình: Intent Analysis -> Hierarchical Planning -> Extended Thinking -> Tool Execution -> Reflection.
- [ ] Bóc tách và thực thi chính xác các lời gọi công cụ định dạng JSON Schema lẫn khối XML/Markdown tags, có cơ chế tự sửa chuỗi JSON dị dạng.
- [ ] Bộ nhớ ngữ cảnh tự động nén/tóm tắt lịch sử khi vượt ngưỡng dung lượng mà vẫn giữ nguyên các quyết định và trạng thái cốt lõi.

### Tích Hợp SunaHarness & VFS
- [ ] Kết nối hoàn hảo với SunaHarness: thao tác thông qua 6 công cụ ACI, tuân thủ `AciSchemaValidator`, và ghi lại đầy đủ Trajectory.
- [ ] Hỗ trợ khôi phục trạng thái từ Checkpoint và phối hợp đa tác nhân thông qua `InterHarnessEventBus`.
- [ ] Tự động sinh và kiểm tra Unified Diff qua `VfsDiffEngine` trước khi áp dụng thay đổi tệp tin.

### Phẫu Thuật Code & Tự Sửa Lỗi
- [ ] Tự động đọc và phân tích thông báo lỗi từ sandbox/trình biên dịch, tự đề xuất bản sửa lỗi chính xác dựa trên tín hiệu thực tế.
- [ ] Cơ chế phát hiện bế tắc (Stuck Detection) ngăn chặn lặp lại cùng một hành động lỗi quá 3 lần.

### Giao Diện SunaChat & Dual Runtime
- [ ] Cung cấp API hook cho UI SunaChat để hiển thị thought process, nút Pause, Resume, Steer và Rewind.
- [ ] Chạy độc lập hoàn hảo trên cả Node.js (headless/test) và Trình duyệt (DOM/IndexedDB).
- [ ] Toàn bộ 1,226 bài kiểm tra hiện tại tiếp tục vượt qua 100% (`npm test`).
- [ ] Bộ kiểm thử mới cho SunaAgent đạt tỷ lệ đỗ 100% với 0 lỗi cú pháp (`npm run check`).
- [ ] `python run_verification.py` đạt 100% màu xanh, không có bất kỳ hồi quy nào.
## 2026-09-07T17:30:27Z

[URGENT / USER DIRECTIVE] Người dùng yêu cầu toàn bộ nhóm subagents và các hội đồng thẩm định tăng tốc tiến trình tối đa, khẩn trương hoàn tất các báo cáo đánh giá (Reviewers, Challengers, Auditor) và sớm chuyển giao cho quy trình Victory Audit để nghiệm thu dự án SunaAgent. Hãy thúc đẩy tiến độ ngay lập tức!

## 2026-09-08T04:03:47Z

Hạn ngạch đã được đặt lại (quota reset completed) và hệ thống đã hoạt động bình thường. Bộ kiểm tra authoritative python run_verification.py đã vượt qua 100% XANH với toàn bộ 1,438 tests passing (0 failing). Hãy tiếp tục công việc bị dừng: triệu tập Cổng Thẩm định Iteration 2 (Reviewers, Challengers, Auditor) để ghi nhận kết quả và thực hiện Victory Audit nghiệm thu dự án SunaAgent.

## 2026-09-08T04:24:49Z

# SunaHarness & SunaAgent — Tối Ưu Hóa Hiệu Năng, Tra Xét Nghiêm Ngặt & Nâng Cấp Toàn Diện

Tối ưu hóa hiệu năng cực hạn, tra xét pháp y đối kháng nghiêm ngặt và nâng cấp toàn diện hệ sinh thái kép SunaHarness runtime và siêu tác nhân SunaAgent, nâng cao năng lực chịu tải, nén ngữ cảnh thông minh, trực quan hóa UI nâng cao và khả năng phục hồi lỗi đối kháng trong môi trường thực tế của SunaChat.

Working directory: d:\Suna Chat
Integrity mode: development

## Requirements

### R1. Tối Ưu Hóa Hiệu Năng Cực Hạn & Quản Lý Bộ Nhớ VFS / DiffEngine
- **Tối ưu hóa thuật toán Myers LCS**: Giảm thiểu tối đa chi phí cấp phát bộ nhớ mảng vết trace trong `VfsDiffEngine`, đảm bảo xử lý so sánh diff các tệp tin lớn (>50,000 dòng hoặc 15+ điểm sửa đổi phân tán) với độ trễ < 100ms.
- **Quản lý bộ nhớ VFS Sandbox**: Cơ chế giải phóng và tái sử dụng bộ nhớ (Garbage Collection friendly) khi VFS thực hiện hàng ngàn thao tác đọc/ghi tệp liên tục, loại bỏ triệt để nguy cơ rò rỉ bộ nhớ (Memory Leaks) trong các phiên chạy dài hạn.

### R2. Tra Xét Nghiêm Ngặt & Tự Phục Hồi Lỗi Đối Kháng (Extreme Adversarial Fuzzing & Chaos Resilience)
- **Kiểm thử đối kháng cấp độ cao nhất**: Thử thách hệ thống với các kịch bản cực đoan: bẫy đệ quy sâu (>= 5 tầng subagent delegation), phân mảnh thông điệp event bus, chuỗi JSON dị dạng lồng ghép phức tạp, và các payload tấn công ReDoS.
- **Cơ chế chịu lỗi và phục hồi Chaos (Chaos Engineering)**: Tự động phát hiện và phục hồi trạng thái từ Checkpoint gần nhất khi gặp sự cố gián đoạn đột ngột (network flapping, quota exhaustion, hoặc process crash), không làm hỏng VFS và không mất dữ liệu Trajectory.

### R3. Nén Ngữ Cảnh Thông Minh & Bộ Nhớ Hai Tầng Thích Ứng (Adaptive Context Compression)
- **Nâng cấp SmartMemory**: Tích hợp thuật toán nén ngữ cảnh dựa trên trọng số thông tin (Information Density & Recency Weighting), tự động tóm tắt các bước trung gian của Episodic Memory khi tiệm cận giới hạn token mà vẫn bảo toàn 100% các quyết định kiến trúc cốt lõi.
- **Truy xuất Working Memory hiệu năng cao**: Tối ưu hóa tốc độ đọc/ghi sự kiện và biến trạng thái trong Working Memory dưới dạng chỉ mục băm (Hash Indexed).

### R4. Nâng Cấp Trực Quan Hóa SunaHarnessVisualizer & Tích Hợp Live Workspace HITL
- **Component DOM Visualizer nâng cao**: Hiển thị trực quan đồ thị cây phân cấp Trajectory, biểu đồ KPI Benchmark Scorecard (SR, eta, FRR) theo thời gian thực và trình xem Unified / Side-by-side diff tô màu cú pháp mượt mà.
- **Điều khiển Human-in-the-Loop thời gian thực**: Hoàn thiện các hook can thiệp: Tạm dừng (Pause), Tiếp tục (Resume), Chèn chỉ thị định hướng (Steer), và Hoàn tác bước (Rewind) phản hồi tức thì (< 50ms) trên giao diện Live Workspace của SunaChat.

### R5. Độc Lập Nền Tảng (Dual Runtime), Hiệu Năng Cao & Zero Regression
- **100% Pure Vanilla JS (ES6+)**: Zero external npm dependencies, chạy mượt mà trên cả Node.js và Trình duyệt Web (window.SunaAgent & window.SunaHarness).
- **Bảo toàn 100% hệ thống SunaChat**: Toàn bộ 1,438 bài tests hiện tại tiếp tục đỗ 100% (npm test), 0 lỗi cú pháp (npm run check), và python run_verification.py đạt 100% màu xanh qua cả 4 giai đoạn.

## Acceptance Criteria

### Hiệu Năng & Quản Lý Bộ Nhớ
- [ ] VfsDiffEngine hoàn thành tạo unified diff cho tệp tin 12,000+ dòng với 15 điểm sửa đổi phân tán trong thời gian < 100ms.
- [ ] Thao tác diff 50,000 dòng trùng khớp phản hồi tức thì (< 10ms).
- [ ] VFS Sandbox và Trajectory giải phóng tài nguyên triệt để khi gọi reset hoặc hủy phiên, không gây rò rỉ RAM.

### Tra Xét Đối Kháng & Chịu Lỗi
- [ ] Xây dựng bộ test đối kháng mở rộng kiểm tra đệ quy sâu >= 5 tầng và bẫy chu trình phụ thuộc vòng, kích hoạt cơ chế ngắt an toàn.
- [ ] Hệ thống tự phục hồi trạng thái từ Checkpoint khi xảy ra ngắt kết nối đột ngột mà không làm hỏng tính toàn vẹn của VFS.
- [ ] Thuật toán JsonAutoRepair vượt qua 100% các ca fuzzing chuỗi JSON dị dạng cực hạn.

### Nén Ngữ Cảnh & Trực Quan Hóa UI
- [ ] SmartMemory tự động nén/tóm tắt các bước cũ khi vượt ngưỡng dung lượng mà vẫn giữ nguyên các biến số và sự kiện then chốt.
- [ ] SunaHarnessVisualizer render mượt mà cây Trajectory, bảng điểm Scorecard và diff viewer trong môi trường DOM trình duyệt.
- [ ] Các lệnh can thiệp HITL (pause, resume, steer, rewind) kích hoạt sự kiện và cập nhật trạng thái trong thời gian < 50ms.

### Kiểm Thử Toàn Diện & Không Hồi Quy
- [ ] Toàn bộ 1,438 bài tests hiện có tiếp tục vượt qua 100% (npm test).
- [ ] Bộ test đối kháng và tối ưu hóa mới đạt tỷ lệ đỗ 100% với 0 lỗi.
- [ ] npm run check và node -c trên toàn bộ tệp đạt 0 lỗi cú pháp.
- [ ] python run_verification.py hoàn thành 100% màu xanh qua cả 4 giai đoạn.

