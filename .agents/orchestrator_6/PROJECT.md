# Project: SunaAgent — Siêu Tác Nhân Tự Trị Độc Quyền Cho Hệ Sinh Thái SunaChat & SunaHarness

## Architecture
SunaAgent là tác nhân tự trị hợp nhất tinh hoa của HermesAgent (Function Calling & Structured Reasoning), Claude Agent (Extended Thinking, Scratchpad & Cẩn trọng chi tiết) và Codex Agent (Code Generation chuẩn xác, Phẫu thuật code & Test-Driven Self-Correction), chạy thuần túy bằng Vanilla JS (ES6+) trên cả Browser và Node.js.

`
+-----------------------------------------------------------------------------------------+
|                                    SunaChat Client UI                                   |
| - Real-time Thought Streaming (.thinking-block-wrapper, pulse indicator, accordion)    |
| - HITL Controls: Pause, Resume, Steer (instruction injection), Rewind (checkpoint)     |
| - Live Workspace 3-Pane Sync (Editor <-> Iframe <-> VFS)                               |
| - SunaHarnessVisualizer (Trajectory Tree, Scorecard SR/η/FRR, Diff Viewer)              |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                               SunaAgent Cognitive Engine                                |
| [R1: OODA / ReAct++ Cognitive Brain]                                                    |
|  - analyzeIntent -> planHierarchy -> thinkExtended -> parseTools -> execute -> reflect |
|  - Extended Thinking / Scratchpad Extraction (<think>, <thought>, <scratchpad>)         |
|  - Multi-Syntax Tool Call Parser (XML tags, Markdown code blocks, Native JSON)          |
|  - Resilient Auto-Repair for Malformed JSON (trailing commas, unquoted keys, truncations)|
|  - Smart Context & Dual Memory (Working Memory, Episodic Memory, Auto-Compaction)       |
|  - Legacy Invariants Preservation (MAX_RECURSION_DEPTH: 4, reset, abort, 5 legacy tools)|
+-----------------------------------------------------------------------------------------+
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
+------------------------------------------+   +------------------------------------------+
|  [R2: SunaHarness Runtime Integration]   |   |   [R3: Codex Surgery & Self-Correction]  |
| - HarnessController (Turn/Token Budget)  |   | - Exact char-level replace_file_content  |
| - 6 ACI Tools (view, replace, grep, etc.)|   |   (UTF-8 Vietnamese & indentation safe)  |
| - AciSchemaValidator (strict validation, |   | - VfsDiffEngine Preview (Unified Diff)   |
|   camelCase/PascalCase normalization)    |   | - Grounded Diagnostic Loop (parse error, |
| - TrajectoryEngine (hierarchical stitch) |   |   stacktrace, ^ pointer, remediation)    |
| - CheckpointManager (rewind / replay)    |   | - Runaway & Stuck Detection (>=3 loops,  |
| - InterHarnessEventBus (multi-agent bus) |   |   ping-pong, stagnant VFS hash)          |
+------------------------------------------+   +------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                 [R5: Platform Independence, Verification & Zero Regression]             |
| - Pure Vanilla JS/ES6+ (zero external npm dependencies, dual runtime Node.js + Browser)  |
| - Zero Regression: 1,226 / 1,226 existing Mocha tests pass 100%                         |
| - New SunaAgent test suites: tests/test_suna_agent.js & test_challenger_adversarial.js  |
| - Syntax hygiene: npm run check (0 syntax errors) & python run_verification.py 100% green|
+-----------------------------------------------------------------------------------------+
`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | OODA / ReAct++ Cognitive Brain | Chu trình nhận thức khép kín: phân tích mục tiêu, kế hoạch đa tầng, suy luận mở rộng, gọi công cụ, quan sát & tự phản tỉnh | M1 | R1 |
| 2 | Extended Thinking & Scratchpad | Bóc tách và quản lý khối Extended Thinking (<think>, <thought>, <scratchpad>) riêng biệt với phản hồi cho người dùng | M1 | R1 |
| 3 | Multi-Syntax Tool Call Parser | Phân tích cú pháp gọi công cụ linh hoạt: XML <suna_tool_call>, Markdown `json blocks, native JSON function calling | M1 | R1 |
| 4 | Malformed JSON Auto-Repair | Tự sửa lỗi JSON dị dạng (trailing commas, unquoted keys, single quotes, thiếu dấu ngoặc đóng do truncation) | M1 | R1 |
| 5 | Smart Context & Dual Memory | Quản lý Working Memory, Episodic Memory, và tóm tắt/nén lịch sử khi vượt ngưỡng dung lượng | M1 | R1 |
| 6 | Legacy Agent Invariants | Bảo toàn MAX_RECURSION_DEPTH: 4, reset(), abort(), _registry, và 5 công cụ legacy cho Gate 4 test suite | M1 | R1 / Survey |
| 7 | Deep SunaHarness Runtime Wiring | Kết nối trực tiếp với HarnessController, VfsSandbox, và toàn bộ 6 công cụ chuẩn ACI | M2 | R2 |
| 8 | Strict AciSchemaValidator Compliance | Chuẩn hóa tham số đầu vào (camelCase <-> PascalCase), bẫy lỗi schema và tự điều chỉnh tham số trước khi gọi ACI | M2 | R2 |
| 9 | Hierarchical Trajectory Recording | Đồng bộ thought -> plan -> action -> observation -> reflection vào TrajectoryEngine bất biến | M2 | R2 |
| 10 | Checkpoint Replay & Rollback | Hỗ trợ lưu checkpoint và tua lại trạng thái VFS/Memory khi nhận diện hướng đi sai lệch | M2 | R2 |
| 11 | InterHarnessEventBus Multi-Agent | Tương thích kênh truyền thông điệp 2 chiều, đóng vai trò Lead Agent hoặc Child Agent với giới hạn đệ quy an toàn | M2 | R2 |
| 12 | Codex Surgical Code Replacement | Phẫu thuật mã nguồn replace_file_content độ chính xác từng ký tự, giữ nguyên thụt lề và bảo toàn tiếng Việt có dấu | M3 | R3 |
| 13 | VfsDiffEngine Preview Integration | Tự động sinh và kiểm tra Unified Git Diff trước khi xác nhận ghi đè vào VFS | M3 | R3 |
| 14 | Grounded Diagnostic Loop | Tự động phân tích stacktrace, lỗi cú pháp node -c, lỗi mocha với con trỏ trực quan ^ và gợi ý khắc phục | M3 | R3 |
| 15 | Stuck & Runaway Detection | Ngăn chặn lặp lại hành động lỗi quá 3 lần, phát hiện dao động chu kỳ 2 và VFS đóng băng | M3 | R3 |
| 16 | Real-time Thought Streaming | Stream tiến trình suy nghĩ lên giao diện SunaChat và Live Workspace dưới dạng khối accordion đóng/mở | M4 | R4 |
| 17 | HITL Controls (Pause/Resume/Steer/Rewind) | Cung cấp API hooks cho người dùng tạm dừng, tiếp tục, can thiệp định hướng và hoàn tác từng bước | M4 | R4 |
| 18 | Live Workspace 2-Way Synchronization | Đồng bộ tự động giữa VFS và #artifact-editor-textarea / #artifact-iframe.srcdoc khi chỉnh sửa mã nguồn | M4 | R4 |
| 19 | SunaHarnessVisualizer Integration | Cung cấp dữ liệu cây quyết định, bảng chỉ số năng lực SR, η, FRR cho component Visualizer | M4 | R4 |
| 20 | Dual Runtime Pure Vanilla JS | Chạy mượt mà không phụ thuộc thư viện ngoài trên cả Node.js (CommonJS/globals) và Browser (window UMD) | M5 | R5 |
| 21 | Zero Regression System Gate | Duy trì 100% đỗ toàn bộ 1,226 bài kiểm tra hiện tại, 0 lỗi cú pháp npm run check, python run_verification.py xanh | M5 | R5 |
| 22 | E2E Testing Suite Track | Xây dựng bộ test mới tests/test_suna_agent.js và test_challenger_suna_agent_adversarial.js bao phủ 4 Tiers, xuất TEST_READY.md | M-TEST | R5 / Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-TEST | e2e_test_suite_track | Xây dựng bộ kiểm thử độc lập tests/test_suna_agent.js và tests/test_challenger_suna_agent_adversarial.js (Tiers 1-4), tạo TEST_READY.md | none | PLANNED |
| M1 | cognitive_brain_and_parsing | R1: Triển khai SunaAgent core với OODA/ReAct++, Extended Thinking, Multi-syntax Parser, JSON auto-repair, Smart Memory và Legacy Invariants | none | PLANNED |
| M2 | sunaharness_deep_integration | R2: Tích hợp sâu SunaHarness, 6 công cụ ACI, AciSchemaValidator, TrajectoryEngine, CheckpointManager, InterHarnessEventBus | M1 | PLANNED |
| M3 | codex_surgery_and_self_correction | R3: Phẫu thuật code chuẩn Codex (UTF-8 safe), VfsDiffEngine preview, Grounded Diagnostic Loop, Stuck Detection | M2 | PLANNED |
| M4 | sunachat_ui_and_hitl_controls | R4: Tích hợp UI Thought Streaming, Live Workspace 2-way sync, HITL hooks (Pause, Resume, Steer, Rewind), Visualizer integration | M3 | PLANNED |
| M5 | final_e2e_verification_and_regression | R5: Chạy toàn bộ 1,226 bài test cũ + toàn bộ test mới cho SunaAgent, kiểm tra cú pháp npm run check, chạy python run_verification.py | M-TEST, M4 | PLANNED |

## Interface Contracts
### SunaAgent ↔ SunaHarness
- SunaAgent.attachHarness(harnessController, options)
- SunaAgent.executeStep({ thought, toolCall, context }) -> Promise<StepResult>
- SunaAgent.invokeAciTool(toolName, rawArgs) -> validates via AciSchemaValidator, previews via VfsDiffEngine, executes on AciInterface
- SunaAgent.recordTrajectory(stepData) -> synchronizes to harness.trajectoryEngine
- SunaAgent.createCheckpoint() / SunaAgent.rewindToCheckpoint(checkpointId) -> delegates to harness.checkpointManager

### SunaAgent ↔ SunaChat & UI
- SunaAgent.on('thought_chunk', (chunk) => ...) -> feeds .thinking-block-wrapper
- SunaAgent.pause() -> flags pause state, yields execution to user
- SunaAgent.resume() -> resumes from paused state
- SunaAgent.steer(guidanceText) -> injects user direction into Working Memory
- SunaAgent.rewind(stepIndex) -> rolls back VFS and memory state
- SunaAgent.on('vfs_change', ({ path, content }) => ...) -> triggers Live Workspace editor/iframe update

## Code Layout
- suna_agent.js: Core standalone SunaAgent UMD module (exporting SunaAgent class, OodaBrain, MultiSyntaxParser, JsonAutoRepair, SmartMemory).
- suna_harness.js: SunaHarness runtime, ACI tools, VfsSandbox, DiffEngine, Validator, TrajectoryEngine, CheckpointManager, and harness agent bridge.
- pp.js: SunaChat frontend bridge connecting SunaAgent to chat input, thought streaming, Live Workspace, and legacy tool fallback.
- 	ests/test_suna_agent.js: Requirement-driven test suite for SunaAgent covering R1 to R5 (Tiers 1-4).
- 	ests/test_challenger_suna_agent_adversarial.js: Adversarial, fuzzing, and stress test suite for SunaAgent.
- TEST_INFRA.md: Test infrastructure architecture and feature checklist.
- TEST_READY.md: Signal that the E2E test suite is complete and ready.
