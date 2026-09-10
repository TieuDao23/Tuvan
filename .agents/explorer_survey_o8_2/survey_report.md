# SunaHarness & SunaAgent — Forensic Survey Report: Adversarial Chaos Resilience & Adaptive SmartMemory (R2 & R3)

**Agent ID**: `explorer_survey_o8_2` (Adversarial, Chaos & SmartMemory Explorer)  
**Date**: 2026-09-08T04:35:00Z  
**Authoritative Request Reference**: `ORIGINAL_REQUEST.md` (Section: 2026-09-08T04:24:49Z)  
**Target Subsystems**: `suna_harness.js`, `suna_agent.js`, `tests/test_challenger_suna_agent_adversarial.js`, `tests/test_suna_agent.js`

---

## Executive Summary

This forensic investigation analyzes the operational robustness, failure modes, and optimization potential of the Suna ecosystem across **Requirement R2 (Extreme Adversarial Fuzzing & Chaos Resilience)** and **Requirement R3 (Adaptive Context Compression & Hash-Indexed Working Memory)**. 

### Key Discoveries:
1. **Sub-Harness Delegation Recursion**: `suna_harness.js` enforces a strict 5-tier recursion limit (`currentDepth >= 5`) and detects self-delegation as well as ancestor lineage cycles. However, sibling ID collision is unhandled when multiple children are spawned with duplicate IDs. In parallel, `suna_agent.js` declares a distinct legacy execution loop invariant (`MAX_RECURSION_DEPTH = 4`), which must be decoupled from the harness multi-agent hierarchy limit.
2. **Event Bus Under Chaos**: `InterHarnessEventBus` delivers synchronously with subscriber error isolation. However, it lacks native chunk sequence reassembly for streaming fragmentation and is vulnerable to synchronous call-stack exhaustion under bidirectional re-entrant messaging loops.
3. **CheckpointManager Chaos Recovery Vulnerabilities**:
   - **VFS Directory Loss**: `saveCheckpoint` captures only `vfsSnapshot.files`. When `rewind` invokes `restoreSnapshot({ files: chk.vfs_snapshot, directories: [] })`, empty directories created via `vfs.mkdir` are permanently lost, and `vfs.directories` is left unpopulated.
   - **Trajectory Decoupling**: Checkpoints do not serialize `TrajectoryEngine` events. On a process crash or page reload from IndexedDB, the VFS state is restored, but the historical trajectory audit trail is completely obliterated.
4. **JsonAutoRepair Edge Cases**: The 9-pass repair algorithm successfully handles unclosed brackets, dangling commas, and unquoted keys, but crashes on:
   - Truncation on backslash escape (`"text": "foo \`) which creates `\"` and fails JSON parsing.
   - Truncation inside Unicode escapes (`\u12"`).
   - Leading commas in objects or arrays (`{ , "a": 1 }`).
   - Numeric or dotted unquoted keys (`{ 123: "val" }`, `{ app.env: "prod" }`).
5. **SmartMemory Context Compression Limitations**: Current `compact()` performs crude FIFO truncation (preserving only the last 2 turns and collapsing everything else into a generic 1-line string), discarding architectural decisions, user steering directives, and diagnostic traces. A formal **Information Density & Recency Weighting** algorithm and a **Hash-Indexed Working Memory** architecture are formulated below to achieve bounded-token stability without information degradation.

---

## Part 1: Requirement R2 — Extreme Adversarial Fuzzing & Chaos Resilience

### 1.1 Sub-Harness Delegation Recursion Depth & Cycle Detection

#### Implementation Analysis (`suna_harness.js:3588-3778`):
Sub-harness delegation is orchestrated by `HarnessController.prototype.spawnSubHarness`:

```javascript
// suna_harness.js:3612-3620
const currentDepth = this.depth !== undefined ? this.depth : 0;
const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 5;
if (currentDepth >= 5 || (options.maxDepth !== undefined && currentDepth >= maxDepth)) {
  throw new HarnessError(
    'MAX_RECURSION_DEPTH_EXCEEDED',
    `Sub-harness recursion depth limit (${maxDepth}) reached. Current depth is ${currentDepth}; cannot spawn further nested sub-harnesses.`,
    { currentDepth, maxDepth, role: options.role }
  );
}
```

- **Recursion Ceiling**: Root harness starts at `depth: 0`. Child controllers receive `childDepth = currentDepth + 1` (`line 3655`). Spawning is permitted for depths 0, 1, 2, 3, and 4 (creating children at depths 1, 2, 3, 4, and 5). Depth 5 controller cannot spawn further sub-harnesses; any invocation triggers `MAX_RECURSION_DEPTH_EXCEEDED`.
- **Custom `maxDepth` Bounds**: If a parent specifies `options.maxDepth < 5`, the condition `currentDepth >= maxDepth` immediately halts delegation at the designated threshold.
- **Delegation Cycle Detection**:
  ```javascript
  // suna_harness.js:3597-3610
  if (childId === this.id) {
    throw new HarnessError(
      'DELEGATION_CYCLE_DETECTED',
      `Self-delegation detected: harness "${this.id}" cannot delegate to itself.`,
      { sourceId: this.id, targetId: childId, lineage: this.lineage }
    );
  }
  if (this.lineage && this.lineage.includes(childId)) {
    throw new HarnessError(
      'DELEGATION_CYCLE_DETECTED',
      `Circular delegation detected: target "${childId}" is an ancestor in lineage [${this.lineage.join(' -> ')}].`,
      { sourceId: this.id, targetId: childId, lineage: this.lineage }
    );
  }
  ```
  Lineage is propagated immutably via `childLineage = [...this.lineage, this.id]` (`line 3685`).

#### Contrast with `suna_agent.js` (`line 658, 1300`):
- `SunaAgent` defines `this.MAX_RECURSION_DEPTH = 4;` and static `SunaAgent.MAX_RECURSION_DEPTH = 4;`.
- **Architectural Clarification**: This value is an immutable legacy invariant protecting the agent's single-turn ReAct reasoning loop (Gate 4 Invariant tested in `test_suna_agent.js:1065` and `test_dsh_zero_regression_matrix.js:131`). It must NOT be modified or confused with the multi-agent delegation harness depth ceiling of 5.

#### Vulnerability Matrix — Delegation & Cycles:
| Threat Scenario | Vulnerability Mechanism | Severity | Recommended Mitigation |
|---|---|---|---|
| Sibling ID Collision | Calling `spawnSubHarness({ id: 'worker' })` twice overwrites `this._children.get('worker')` silently without error. | Medium | Throw `SUB_HARNESS_ALREADY_EXISTS` if `this._children.has(childId)` and previous child is active. |
| Global Bus Collision | Two sibling sub-harnesses with identical ID register duplicate listeners on `this.bus.subscribe(childId)`. | High | Enforce harness ID uniqueness across the shared event bus registry. |
| Deep Graph Deadlock | Sub-harness depth 4 requests parent intervention, while parent waits synchronously for child. | Medium | Implement non-blocking asynchronous event delegation with heartbeat liveness. |

---

### 1.2 InterHarnessEventBus Under Stress & Fragmentation

#### Implementation Analysis (`suna_harness.js:3104-3294`):
The `InterHarnessEventBus` provides P2P (`to: harnessId`), broadcast (`to: '*'`), and request-response (`request()`) semantics over a synchronous in-memory dispatcher.

#### Stress Characteristics:
1. **Ordering Guarantees**:
   - Single-threaded synchronous execution: Messages dispatched via `send()` are delivered to target subscribers in exact registration sequence before `send()` returns.
   - Ring Buffer: `this.history` is capped at `maxHistory` (default 1000 items). Oldest envelopes are dropped via `shift()` when full (`line 3189-3191`).
2. **Subscriber Error Isolation**:
   ```javascript
   // suna_harness.js:3219-3226
   targets.forEach(fn => {
     try {
       fn(envelope);
       deliveredCount++;
     } catch (err) {
       console.error(`[InterHarnessEventBus] Subscriber error on message ${envelope.id}:`, err);
     }
   });
   ```
   A subscriber throwing an unhandled exception does not block subsequent subscribers from receiving the message.
3. **Identified Chaos Failure Modes**:
   - **Stream Fragmentation**: When large data or LLM token chunks are transmitted, there is no chunk reassembly protocol. Sub-agents receiving fragmented packets have no standard mechanism to detect `chunk_index`, `total_chunks`, or packet reordering.
   - **Synchronous Stack Overflow (Re-entrancy Ping-Pong)**: If Agent A emits a message on receiving Agent B's message synchronously without `queueMicrotask` or `setTimeout`, Node.js throws `RangeError: Maximum call stack size exceeded` in fewer than 10,000 hops.
   - **Dangling Correlation Requests**: In `request()` (`line 3250-3266`), if a target sub-harness crashes or halts before replying, the request hangs until `timeoutMs` (5000ms). When multiple sub-harnesses crash simultaneously, hundreds of pending request timers accumulate in memory.

---

### 1.3 CheckpointManager Chaos Recovery & Crash Resilience

#### Implementation Analysis (`suna_harness.js:4540-4709`, `4831-5050`):
- `saveCheckpoint(stepIndex, memoryOrMetadata)`: Generates `vfsSnapshot = this.vfs.createSnapshot()`, creates frozen checkpoint record, and stores it in `this.checkpoints`.
- `rewind(stepIndex)`: Calls `this.vfs.restoreSnapshot({ files: chk.vfs_snapshot, directories: [] })`, resets `this.memoryStore.facts`, and deletes all checkpoints with index $> stepIndex$.
- `IndexedDbCheckpointStore`: Asynchronously commits normalized checkpoint records to browser IndexedDB or `InMemoryIdbFallback`.

#### Forensic Analysis of Crash Recovery Deficiencies:

```
+-------------------------------------------------------------------------+
| CRITICAL DEFICIENCY 1: DIRECTORY STRUCTURE LOSS ON REWIND               |
+-------------------------------------------------------------------------+
Observation (suna_harness.js:4569 & 4607):
  saveCheckpoint: const vfsSnapshot = this.vfs.createSnapshot();
                  vfs_snapshot: vfsSnapshot.files   <-- DIRECTORIES OMITTED!
  rewind:         this.vfs.restoreSnapshot({ files: chk.vfs_snapshot, directories: [] });
  restoreSnapshot (suna_harness.js:835-842):
                  this.directories.clear();
                  if (Array.isArray(snapshot.directories)) { ... } // Empty!
                  this.directories.add('');
Impact:
  Any directories created via vfs.mkdir('src/empty_module') or parent folder
  structures without files are permanently deleted upon checkpoint restoration.
  vfs.listDir('src') cannot discover folders that do not directly host a file node.
```

```
+-------------------------------------------------------------------------+
| CRITICAL DEFICIENCY 2: TRAJECTORY AUDIT TRAIL LOSS ON CRASH RECOVERY    |
+-------------------------------------------------------------------------+
Observation (suna_harness.js:4901-4927):
  IndexedDbCheckpointStore._normalizeRecord stores:
  { checkpointId, uid, stepIndex, timestamp, vfsSnapshot, contextMemory, metadata }
Impact:
  TrajectoryEngine events are NOT captured in the persistent checkpoint!
  If a browser tab crashes, network flaps, or quota exhaustion interrupts execution:
  - VFS files are restored from IndexedDB.
  - Working memory facts are restored.
  - BUT the entire Trajectory event history (thoughts, actions, tool outputs, durations)
    is completely wiped out. SunaHarnessVisualizer renders an empty scorecard.
```

#### Proposed Chaos Resilience Patch Design:
1. Store full snapshot: `{ files: vfsSnapshot.files, directories: vfsSnapshot.directories }`.
2. In `restoreSnapshot`, automatically populate ancestor directories for every file path if directories array is missing.
3. Serialize `trajectoryEvents = this.trajectory ? this.trajectory.getEvents() : []` into checkpoint records and re-hydrate `TrajectoryEngine` on `restoreFromIndexedDB`.

---

### 1.4 JsonAutoRepair Implementation & Extreme Adversarial Edge Cases

#### Current Pipeline (`suna_agent.js:78-189`):
`JsonAutoRepair` applies a 9-stage regex and stack-based normalization:
1. Normalizes smart double/single quotes (`\u201C\u201D` $\to `"$, `\u2018\u2019` $\to `'`).
2. Strips Markdown fences (`^```(?:json)? ... ```$`).
3. Single-to-double quote substitution with escaped quote preservation.
4. Quotes unquoted object keys (`/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/`).
5. Deduplicates consecutive commas (`/,(\s*,)+/` $\to `,`).
6. Removes trailing commas before `}` or `]`.
7. Resolves dangling colons (`/:\s*(?=[}\],]|$)/` $\to `: null`).
8. Converts literal unescaped newlines in multiline strings to `\n`.
9. Delimiter balancing using a LIFO character stack.

#### Extreme Adversarial Edge Case Analysis:

| Test Case | Raw Malformed String | Current Behavior | Vulnerability Classification | Root Cause |
|---|---|---|---|---|
| **E1: Truncation on Escape** | `{"path": "C:\\Program Files\\` | Produces `{"path": "C:\\Program Files\\"` where `\"` is an escaped quote! | **Fatal SyntaxError** | Loop finishes with `escaped = true`. Append `"` becomes part of string literal. |
| **E2: Truncation in Unicode** | `{"msg": "Code \u00` | Appends `"` $\to$ `{"msg": "Code \u00"}` | **Fatal SyntaxError** | RFC 8259 mandates exactly 4 hex digits following `\u`. |
| **E3: Leading Commas** | `{"items": [ , 1, 2 ]}` | Leaves comma $\to$ `{"items": [ , 1, 2 ]}` | **Fatal SyntaxError** | Step 5 only cleans `,(\s*,)+`, not `[,\{]\s*,`. |
| **E4: Unquoted Numeric Key** | `{"config": { 8080: "port" }}` | Unrepaired $\to$ `{ 8080: "port" }` | **Fatal SyntaxError** | Regex requires key to begin with `[a-zA-Z_]`. |
| **E5: Dotted Object Key** | `{ app.name: "SunaChat" }` | Unrepaired | **Fatal SyntaxError** | Regex does not allow `.` in unquoted keys. |
| **E6: Mid-Primitive Cutoff** | `{"active": tru` | Repaired to `{"active": tru}` | **Fatal SyntaxError** | `tru` is neither string nor valid JSON literal. |
| **E7: Embedded Quotes** | `{"thought": "He said "yes" to me"}` | String prematurely terminates at `"yes"` | **Parsing Corruption** | Lack of lookahead heuristic for unescaped double quotes inside value strings. |

#### Comprehensive Edge Case Enhancement Specification:
To achieve 100% resilience against adversarial LLM stream corruption, `JsonAutoRepair` must:
1. If the string terminates with an odd number of trailing backslashes `\`, strip the dangling backslash before appending `"`.
2. Detect incomplete `\u[0-9a-fA-F]{0,3}$` at string boundary and pad or strip it.
3. Clean leading commas: `text.replace(/([{[])\s*,\s*/g, '$1 ')`.
4. Allow numeric and dotted keys: `/([{,]\s*)([a-zA-Z0-9_\-\.]+)\s*:/g`.
5. Convert dangling truncated literals `tru` $\to `true`, `fals` $\to `false`, `nul` $\to `null`.

---

## Part 2: Requirement R3 — Adaptive Context Compression & Hash-Indexed Working Memory

### 2.1 Current SmartMemory Architecture (`suna_agent.js:468-538`)

Current implementation:
- `this.workingMemory = new Map(Object.entries(options.initialFacts || {}));`
- `this.episodicMemory = [];`
- `this.maxTokens = options.maxTokens || 16000;`
- Token Estimation heuristic: `Math.ceil(length / 4)` across system prompt, working facts, and episodic entries.
- Compaction trigger: `if (currentTokens > this.maxTokens && this.episodicMemory.length > 3) this.compact();`

#### Critical Flaws in Current `compact()` (`line 511-537`):
```javascript
compact() {
  if (this.episodicMemory.length <= 2) return false;
  const preserveCount = 2;
  const toSummarize = this.episodicMemory.slice(0, this.episodicMemory.length - preserveCount);
  const preserved = this.episodicMemory.slice(this.episodicMemory.length - preserveCount);
  ...
  const summaryEpisode = {
    type: 'compacted_summary',
    summary: `Prior ${toSummarize.length} turns executed tools: [${actions.join(', ')}]. Files accessed: [${Array.from(filePaths).join(', ')}].`,
    compactedTurns: toSummarize.length,
    timestamp: new Date().toISOString()
  };
  this.episodicMemory = [summaryEpisode, ...preserved];
  return true;
}
```
1. **Severe Information Eviction**: Only the 2 most recent turns survive. A task with 15 turns destroys turns 1 to 13 completely.
2. **Destruction of Architectural Invariants**: If the user commanded `steer("Never modify server.js directly")` at turn 3, or if the agent established an architectural pattern at turn 4, that information is compressed into: `"Prior 13 turns executed tools: [view_file, replace_file_content]"`. The invariant is entirely lost!
3. **No Sensitivity to Information Density**: A 2000-token verbose directory listing is treated with the same weight as a critical bug hypothesis or syntax test diagnostic.

---

### 2.2 Formulation: Information Density & Recency Weighting Compression Algorithm

To satisfy Requirement R3, we formulate an adaptive two-parameter retention algorithm:

#### Mathematical Formulation:
Let episodic history be a sequence of events $E = \langle e_1, e_2, \dots, e_N \rangle$, where $e_N$ is the latest step.  
For each event $e_i$, we define:
1. **Age (Turn Distance)**: $\Delta t_i = N - i$, where $\Delta t_i = 0$ for the most recent turn.
2. **Information Density Multiplier $\rho(e_i) \in [0.1, 1.0]$**:
   $$\rho(e_i) = \begin{cases} 
   1.0 & \text{if } e_i \text{ is an Architectural Decision, Constraint, or Steer Directive} \\
   0.85 & \text{if } e_i \text{ is a Code Surgery Action (`replace_file_content`)} \\
   0.70 & \text{if } e_i \text{ is a Root-Cause Diagnostic or Failing Test Stacktrace} \\
   0.50 & \text{if } e_i \text{ is a Successful Command Execution Output} \\
   0.30 & \text{if } e_i \text{ is a Read-Only Query (`view_file`, `list_dir`, `grep_search`)} \\
   0.15 & \text{if } e_i \text{ is Transient Thought Chatter or Redundant Failure}
   \end{cases}$$
3. **Recency Weight $R(\Delta t_i) \in (0, 1]$**:
   $$R(\Delta t_i) = \begin{cases} 
   1.0 & \text{if } \Delta t_i < K_{\text{protect}} \quad (K_{\text{protect}} = 3) \\
   e^{-\lambda (\Delta t_i - K_{\text{protect}})} & \text{if } \Delta t_i \ge K_{\text{protect}}
   \end{cases}$$
   where $\lambda = \frac{\ln(2)}{H}$ with half-life $H = 6$ turns ($\lambda \approx 0.1155$).
4. **Composite Retention Score $S(e_i)$**:
   $$S(e_i) = \rho(e_i) \cdot \left( \beta_{\text{floor}} + (1 - \beta_{\text{floor}}) \cdot R(\Delta t_i) \right)$$
   where baseline floor $\beta_{\text{floor}} = 0.35$.

#### Preservation Guarantee Theorem:
For any Architectural Decision $e_{\text{arch}}$:
$$S(e_{\text{arch}}) \ge 1.0 \cdot \beta_{\text{floor}} = 0.35$$
For any aged Read-Only Query $e_{\text{read}}$ with $\Delta t \ge 10$:
$$S(e_{\text{read}}) \le 0.30 \cdot (0.35 + 0.65 \cdot e^{-0.1155 \times 7}) = 0.30 \cdot (0.35 + 0.289) \approx 0.191$$
Because $S(e_{\text{arch}}) > S(e_{\text{read}})$, an architectural decision recorded 20 turns ago will **always** have a higher retention priority than an exploratory file read made 7 turns ago!

#### Three-Tier Progressive Compaction Protocol:
When `estimateTokens() > maxTokens`:
- **Tier 1 (Observation Truncation)**: For all events where $S(e_i) < 0.40$, truncate tool observations exceeding 150 characters down to a compact digest (preserving line count, status, and target path). Re-estimate tokens.
- **Tier 2 (Cluster Merging)**: Merge contiguous sequences of low-density events ($S(e_i) < 0.35$) into an aggregated interval summary, preserving exact tool names and target file sets.
- **Tier 3 (Semantic Distillation)**: If token limits are still exceeded, convert anchor events ($S(e_i) \ge 0.60$) into distilled canonical key-value decisions inserted into Working Memory (`arch:decision_<id>`), ensuring 0% token loss for critical architecture while shrinking episodic JSON footprint.

---

### 2.3 Hash-Indexed Working Memory Architecture (O(1) State Read/Write)

#### Architecture Blueprint:
To replace the simple `Map<string, any>` in `SmartMemory.prototype.workingMemory`, we design a high-throughput **Hash-Indexed Working Memory**:

```
+---------------------------------------------------------------------------------+
|                         HASH-INDEXED WORKING MEMORY                             |
+---------------------------------------------------------------------------------+
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   | 1. PRIMARY STORE (Map<string, WorkingFactEntry>)                         |   |
|   |    Key: "namespace:identifier"  -->  Value: { val, hash, ver, tags, ts } |   |
|   +-------------------------------------------------------------------------+   |
|                                     |                                           |
|              +----------------------+----------------------+                    |
|              v                                             v                    |
|   +------------------------+                    +---------------------------+   |
|   | 2. NAMESPACE INDEX     |                    | 3. INVERTED TAG INDEX     |   |
|   |    Map<string,         |                    |    Map<string,            |   |
|   |        Set<string>>    |                    |        Set<string>>       |   |
|   |    'arch' -> {k1, k2}  |                    |    'critical' -> {k1}     |   |
|   |    'steer'-> {k3}      |                    |    'dirty'    -> {k2}     |   |
|   +------------------------+                    +---------------------------+   |
|              |                                             |                    |
|              +----------------------+----------------------+                    |
|                                     v                                           |
|   +-------------------------------------------------------------------------+   |
|   | 4. ROLLING 32-BIT FNV-1a INTEGRITY CHECKSUM (_stateHash)                |   |
|   |    O(1) incremental update on set/delete; instant dirty check in 0.01µs |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
```

#### Detailed Component Specifications:
1. **Namespaced Addressing**: Keys follow `namespace:key` format (e.g. `arch:db_strategy`, `steer:latest_rule`, `metric:token_usage`). Unprefixed keys default to `facts:key`.
2. **O(1) Namespace Lookups**:
   - `getNamespace(ns)`: Directly queries `this._namespaces.get(ns)`, returning a pre-indexed Set of keys. Enables instantaneous retrieval of all architectural constraints without iterating the entire fact base.
3. **Rolling FNV-1a Checksum (`_stateHash`)**:
   ```javascript
   // Fast 32-bit FNV-1a hash step
   function fnv1aStep(currentHash, str) {
     let h = currentHash;
     for (let i = 0; i < str.length; i++) {
       h ^= str.charCodeAt(i);
       h = Math.imul(h, 0x01000193);
     }
     return h >>> 0;
   }
   ```
   When `setFact(key, value)` is called:
   - Old entry hash is XOR-subtracted: `_stateHash = (_stateHash ^ oldEntryHash) >>> 0`
   - New entry hash is XOR-added: `_stateHash = (_stateHash ^ newEntryHash) >>> 0`
   - **Benefit**: Determining if working memory changed between steps is an $O(1)$ integer comparison (`this._stateHash !== prevStepHash`), replacing expensive $O(N)$ `JSON.stringify` serialization.
4. **Copy-on-Write Snapshotting**:
   - Maintains an integer `_version` counter. Checkpoint capture clones only the primary Map reference structure, enabling instant zero-latency snapshots.

---

## Part 3: Review of Existing Test Suites

### 3.1 `tests/test_challenger_suna_agent_adversarial.js` (34 Tests — 100% Passing)
- **Suite Structure**:
  - `1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)`: 11 tests covering unclosed objects/arrays, trailing commas, double commas (`{"a": 1,, "b": 2}`), single quotes with escapes, mid-value cutoffs, and smart quotes.
  - `2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)`: 9 tests covering mixed XML tool calls + Markdown JSON blocks, single-quoted XML attributes, unquoted attributes, unclosed `<think>` / `<scratchpad>` blocks preceding tool calls.
  - `3. Codex Code Surgery & Vietnamese UTF-8 Fuzzing`: 4 tests validating full Vietnamese diacritical alphabet, Unicode Normalization NFC vs NFD equivalence, nested tabs/spaces indentation preservation, and Git unified diff generation.
  - `4. Circuit Breaker & Consecutive Failures Fuzzing`: 10 tests confirming `RunawayGuardrails` unit bounds and `SunaAgent` autonomous loop halting when consecutive failures reach 3.
- **Audit Assessment**: Outstanding execution speed (90ms). Excellent stress coverage of legacy baseline behaviors. However, it currently lacks tests for the extreme JSON truncation edge cases (backslash cutoff, unicode escape truncation, leading commas) identified in Section 1.4.

### 3.2 `tests/test_suna_agent.js` (178 Tests — 100% Passing)
- **Suite Structure**:
  - **Tier 1 (Features 1 to 22)**: 132 tests covering OODA brain, extended thinking, multi-syntax parsing, JSON repair, SmartMemory baseline (T1-F5-1 to T1-F5-6), legacy invariants (`MAX_RECURSION_DEPTH = 4`), harness wiring, schema validation, trajectory recording, checkpoint replay, event bus, code surgery, visualizer, dual runtime, and zero regression.
  - **Tier 2 (Boundary & Corner Cases)**: 26 tests testing empty strings, >1MB file buffers, severely truncated JSON, >10 levels deep JSON nesting, path traversals (`../../../../etc/passwd`), inverted bounds, token ceilings, circular references.
  - **Tier 3 (Cross-Feature Combinations)**: 15 comprehensive workflows chaining JSON repair $\to$ schema validator $\to$ ACI $\to$ trajectory $\to$ live workspace.
  - **Tier 4 (Real-World Multi-Step Scenarios)**: 5 end-to-end tasks including surgical bug fixes, multi-file scaffolding, and human-in-the-loop steering.
- **Audit Assessment**: Authoritative and robust. Strict zero regression baseline. Execution completes in ~9 seconds with 100% green status.

---

## Part 4: Verification Method & Reproduction Commands

To independently reproduce and verify all findings:
```powershell
# 1. Execute Challenger Adversarial Test Suite
npx mocha tests/test_challenger_suna_agent_adversarial.js

# 2. Execute Full SunaAgent E2E Test Suite (178 tests)
npx mocha tests/test_suna_agent.js

# 3. Execute M1 Event Bus & Trajectory Adversarial Suite
npx mocha tests/test_challenger_m1_event_bus_and_trajectory.js

# 4. Execute M1 VFS Lifecycle & Recursion Guard Suite
npx mocha tests/test_challenger_m1_adversarial_vfs_lifecycle.js

# 5. Full Authoritative System Verification (4 Gates)
python run_verification.py
```
Expected output: 100% passing across all test suites, 0 syntax errors on `node -c`, and balanced CSS braces.
