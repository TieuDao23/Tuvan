# SunaHarness Milestone 1 Strategy: Inter-Harness Event Bus & Trajectory Tree Stitching

**Document ID**: SUNA-M1-STRATEGY-02  
**Author**: Explorer M1_2 (`explorer_m1_2`)  
**Target Architecture**: `d:\Suna Chat\suna_harness.js`  
**Milestone**: Milestone 1: Sub-harness Delegation & Event Bus (R1)  
**Synergy**: Complements `explorer_m1_1` (Sub-harness Spawning, VFS Partitioning Modes `share`/`clone`/`branch`, and `mergeSubHarness`)  
**Timestamp**: 2026-09-07T13:55:00Z  

---

## 1. Executive Summary & Architectural Context

In frontier autonomous multi-agent environments (such as **OpenHands**, **SWE-agent**, and **LangGraph**), hierarchical agent orchestration requires two fundamental runtime pillars:
1. **A Reliable, Structured Inter-Agent Communication Fabric (`InterHarnessEventBus`)**: Enables parent and child sub-harnesses to exchange directives, stream telemetry heartbeats, query internal states, and execute emergency halts with deterministic message delivery and fault isolation.
2. **A Hierarchical Trajectory Event Store (`TrajectoryEngine`)**: Replaces flat event sequences with a recursive multi-agent tree structure (`TrajectoryTreeNode`), allowing child agent execution steps to be stitched cleanly under parent delegation nodes without loss of attribution, metrics, or immutability.

This document details the concrete technical specification, exact method signatures, data structures, and implementation hook points in `d:\Suna Chat\suna_harness.js` for both subsystems. It guarantees **100% backward compatibility** with existing single-agent executions, 0 external npm dependencies, and seamless integration with Milestone 2 (Diff/Schema) and Milestone 3 (UI Visualizer/Persistence).

---

## 2. InterHarnessEventBus Architecture & Implementation Strategy

### 2.1 Messaging Topologies & Routing Mechanics

The `InterHarnessEventBus` acts as a central in-memory message broker coordinating communication across all active harness instances (parent, children, siblings, and sub-children).

```
                      +-----------------------------------------+
                      |         InterHarnessEventBus            |
                      | - subscribers: Map<string, Set<fn>>     |
                      | - history: Array<InterHarnessMessage>   |
                      | - pendingRequests: Map<string, object>  |
                      +--------------------+--------------------+
                                           |
        +----------------------------------+----------------------------------+
        | (Targeted: 'sub_coder_1')        | (Broadcast: '*')                 | (Targeted: 'parent')
        v                                  v                                  v
+------------------+             +-------------------+              +-------------------+
|  Sub-Harness 1   |             |   Sub-Harness 2   |              |  Parent Harness   |
| (Role: 'coder')  |             | (Role: 'reviewer')|              | (Role: 'root')    |
+------------------+             +-------------------+              +-------------------+
```

#### Routing Modes:
1. **Targeted Point-to-Point (`to: <harnessId>`)**:
   - Delivers messages directly to listeners registered for the specific `harnessId`.
   - Used for parent directives (`parent` $\to$ `sub_coder_1`), status queries, or direct responses.
   - If recipient is unregistered or inactive: message is logged in `history`, no unhandled exception is thrown, and returns `{ delivered: false, recipient: to, reason: 'NO_ACTIVE_SUBSCRIBERS' }`.
2. **Broadcast Pub/Sub (`to: '*'`)**:
   - Transmits message to all registered listeners regardless of their ID.
   - Delivers to wildcard listeners (`'*'`) as well as all specific harness listeners.
   - Used for system-wide notifications, emergency stops (`emergency_stop`), and global pause/resume.
3. **Promise-based Request/Response (`request(...)`)**:
   - Implements synchronous-like correlation over asynchronous message passing.
   - Generates a unique `correlationId`, sets a timeout handler, and waits for a corresponding response message carrying the matching `correlationId`.

### 2.2 Standardized Envelope Schema (`InterHarnessMessage`)

Every message flowing through the bus MUST conform to the immutable envelope structure:

```typescript
interface InterHarnessMessage {
  id: string;                         // Unique message ID: `msg_${epochMs}_${hash}`
  correlationId?: string | null;      // Correlation identifier for request-response flows
  from: string;                       // Sender harness ID (e.g. 'root', 'subharness_worker_1')
  to: string;                         // Target harness ID or '*' for broadcast
  type: InterHarnessEventType;        // Envelope type
  timestamp: string;                  // ISO 8601 UTC timestamp
  epochMs: number;                    // Numeric timestamp for rapid sorting and filtering
  payload: Record<string, any>;       // Structured typed payload
  metadata?: Record<string, any>;     // Optional routing metadata (tags, tracing, hop count)
}
```

### 2.3 Concrete Envelope Types & Typed Payloads

The system enforces six core envelope types required by R1, plus three supplemental coordination envelopes:

#### 1. `directive` (Parent $\to$ Child)
Transmits actionable instructions or sub-goals from parent to child sub-harness.
```json
{
  "id": "msg_1725713400100_a1f4",
  "from": "root",
  "to": "subharness_coder_1",
  "type": "directive",
  "timestamp": "2026-09-07T13:50:00.100Z",
  "epochMs": 1725713400100,
  "payload": {
    "directiveId": "dir_001",
    "instruction": "Inspect src/app.js and refactor calculateDiscount to prevent negative totals.",
    "priority": "HIGH",
    "context": {
      "targetFile": "src/app.js",
      "testCommand": "npm test tests/discount.test.js",
      "maxTurnsOverride": 5
    },
    "timeoutMs": 20000
  }
}
```

#### 2. `status_query` (Parent $\to$ Child)
Polls the child sub-harness for its live execution metrics, active tool, and memory state.
```json
{
  "id": "msg_1725713400200_b2e5",
  "correlationId": "req_status_991",
  "from": "root",
  "to": "subharness_coder_1",
  "type": "status_query",
  "timestamp": "2026-09-07T13:50:00.200Z",
  "epochMs": 1725713400200,
  "payload": {
    "queryId": "qry_01",
    "includeMemory": true,
    "includeTrajectory": false
  }
}
```

#### 3. `emergency_stop` (Parent $\to$ Child or Broadcast `*`)
Forces immediate halt of child sub-harness execution, invalidating in-flight actions.
```json
{
  "id": "msg_1725713400300_c3d6",
  "from": "root",
  "to": "subharness_coder_1",
  "type": "emergency_stop",
  "timestamp": "2026-09-07T13:50:00.300Z",
  "epochMs": 1725713400300,
  "payload": {
    "reason": "Parent total token budget exceeded 50,000 threshold.",
    "code": "BUDGET_EXHAUSTED",
    "immediate": true,
    "haltDetails": {
      "parentTokensConsumed": 50120,
      "maxParentTokens": 50000
    }
  }
}
```

#### 4. `progress` (Child $\to$ Parent)
Streams heartbeat and execution telemetry after each turn or tool invocation.
```json
{
  "id": "msg_1725713400400_d4c7",
  "from": "subharness_coder_1",
  "to": "root",
  "type": "progress",
  "timestamp": "2026-09-07T13:50:00.400Z",
  "epochMs": 1725713400400,
  "payload": {
    "currentTurn": 3,
    "maxTurns": 10,
    "tokensConsumed": 4250,
    "maxTokens": 20000,
    "percentEstimate": 45,
    "activeTool": "replace_file_content",
    "lastThought": "Replaced ternary guard on line 42; running tests to verify.",
    "status": "running"
  }
}
```

#### 5. `completed` (Child $\to$ Parent)
Announces successful task completion with consolidated execution statistics and results.
```json
{
  "id": "msg_1725713400500_e5b8",
  "from": "subharness_coder_1",
  "to": "root",
  "type": "completed",
  "timestamp": "2026-09-07T13:50:00.500Z",
  "epochMs": 1725713400500,
  "payload": {
    "success": true,
    "summary": "Fixed negative total calculation in src/app.js; verified with passing tests.",
    "turnsUsed": 4,
    "tokensUsed": 5120,
    "durationMs": 1420,
    "modifiedFiles": ["src/app.js"],
    "resultData": {
      "testsPassed": 6,
      "testsFailed": 0
    },
    "trajectoryEventCount": 8
  }
}
```

#### 6. `failed` (Child $\to$ Parent)
Reports unrecoverable failure, budget exhaustion, or fatal syntax errors.
```json
{
  "id": "msg_1725713400600_f6a9",
  "from": "subharness_coder_1",
  "to": "root",
  "type": "failed",
  "timestamp": "2026-09-07T13:50:00.600Z",
  "epochMs": 1725713400600,
  "payload": {
    "success": false,
    "error": "MAX_TURNS_EXCEEDED: Sub-harness reached maximum turn limit of 10 without passing tests.",
    "code": "MAX_TURNS_EXCEEDED",
    "recoverable": false,
    "turnsUsed": 10,
    "tokensUsed": 12800,
    "lastTool": "run_sandboxed_command",
    "diagnostics": {
      "failingTest": "tests/discount.test.js:18"
    }
  }
}
```

#### Supplemental Envelopes:
- **`assistance_request`** (Child $\to$ Parent): When child encounters a blockage and requires parent guidance.
- **`pause` / `resume`** (Parent $\to$ Child): Freezes/unfreezes execution during manual human-in-the-loop review.
- **`response`** (Any $\to$ Any): Response envelope carrying `correlationId` to fulfill `request()`.

### 2.4 Concrete Implementation: `class InterHarnessEventBus`

```javascript
class InterHarnessEventBus {
  constructor(options = {}) {
    this.subscribers = new Map(); // harnessId -> Set<Function>
    this.history = [];            // Array<InterHarnessMessage>
    this.maxHistory = options.maxHistory || 1000;
    this.pendingRequests = new Map(); // correlationId -> { resolve, reject, timer }
    this.interceptors = [];       // Array<Function(msg): msg | boolean>
  }

  /**
   * Subscribe to messages for a specific harnessId or '*' for all broadcast messages.
   * @param {string} harnessId
   * @param {Function} callback (message: InterHarnessMessage) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(harnessId, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('[InterHarnessEventBus] Callback must be a function');
    }
    const id = String(harnessId || '*');
    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }
    this.subscribers.get(id).add(callback);
    return () => this.unsubscribe(id, callback);
  }

  /**
   * Unsubscribe a previously registered callback.
   */
  unsubscribe(harnessId, callback) {
    const id = String(harnessId || '*');
    const set = this.subscribers.get(id);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(id);
    }
  }

  /**
   * Transmit a message over the bus.
   * @param {object} messageOptions { from, to, type, payload, correlationId, metadata }
   * @returns {object} { message: InterHarnessMessage, delivered: boolean, subscriberCount: number }
   */
  send(messageOptions) {
    if (!messageOptions || typeof messageOptions !== 'object') {
      throw new Error('[InterHarnessEventBus] Message options must be an object');
    }
    const { from, to, type, payload, correlationId, metadata } = messageOptions;
    if (!from || !to || !type) {
      throw new Error('[InterHarnessEventBus] "from", "to", and "type" are required fields');
    }

    const now = Date.now();
    const hash = Math.random().toString(36).substring(2, 8);
    const msg = Object.freeze({
      id: `msg_${now}_${hash}`,
      correlationId: correlationId || null,
      from: String(from),
      to: String(to),
      type: String(type),
      timestamp: new Date(now).toISOString(),
      epochMs: now,
      payload: payload !== undefined ? payload : {},
      metadata: metadata || {}
    });

    // Run interceptors (middleware)
    for (const interceptor of this.interceptors) {
      try {
        if (interceptor(msg) === false) return { message: msg, delivered: false, subscriberCount: 0 };
      } catch (e) {
        console.error('[InterHarnessEventBus] Interceptor error:', e);
      }
    }

    // Append to ring buffer history
    this.history.push(msg);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Check correlation matching for request/response
    if (msg.correlationId && this.pendingRequests.has(msg.correlationId)) {
      const pending = this.pendingRequests.get(msg.correlationId);
      clearTimeout(pending.timer);
      this.pendingRequests.delete(msg.correlationId);
      pending.resolve(msg);
    }

    // Dispatch to subscribers:
    // 1. Direct targeted subscribers (to: msg.to)
    // 2. Wildcard subscribers (to: '*')
    const targets = new Set();
    const directSet = this.subscribers.get(msg.to);
    if (directSet) directSet.forEach(fn => targets.add(fn));

    if (msg.to !== '*') {
      const wildcardSet = this.subscribers.get('*');
      if (wildcardSet) wildcardSet.forEach(fn => targets.add(fn));
    } else {
      // If msg.to is '*', notify all registered subscriber sets
      this.subscribers.forEach((set, id) => {
        set.forEach(fn => targets.add(fn));
      });
    }

    let deliveredCount = 0;
    targets.forEach(fn => {
      try {
        fn(msg);
        deliveredCount++;
      } catch (err) {
        console.error(`[InterHarnessEventBus] Subscriber error on message ${msg.id}:`, err);
      }
    });

    return {
      message: msg,
      delivered: deliveredCount > 0,
      subscriberCount: deliveredCount
    };
  }

  /**
   * Broadcast a message to all subscribers (to: '*').
   */
  broadcast(from, type, payload, metadata) {
    return this.send({ from, to: '*', type, payload, metadata });
  }

  /**
   * Request-Response helper. Transmits message and waits for response with matching correlationId.
   */
  request(from, to, type, payload, options = {}) {
    const timeoutMs = options.timeoutMs || 5000;
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`[InterHarnessEventBus] Request timed out after ${timeoutMs}ms (correlationId: ${correlationId})`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timer });

      try {
        this.send({ from, to, type, payload, correlationId, metadata: options.metadata });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(correlationId);
        reject(err);
      }
    });
  }

  /**
   * Filter and inspect message history.
   */
  getHistory(filter = {}) {
    return this.history.filter(msg => {
      if (filter.from && msg.from !== filter.from) return false;
      if (filter.to && msg.to !== filter.to && msg.to !== '*') return false;
      if (filter.type && msg.type !== filter.type) return false;
      if (filter.sinceEpochMs && msg.epochMs < filter.sinceEpochMs) return false;
      return true;
    });
  }

  /**
   * Clear history, subscribers, and cancel pending requests.
   */
  clear() {
    this.history = [];
    this.subscribers.clear();
    this.pendingRequests.forEach(pending => {
      clearTimeout(pending.timer);
      pending.reject(new Error('[InterHarnessEventBus] Bus cleared; request aborted'));
    });
    this.pendingRequests.clear();
  }
}
```

---

## 3. TrajectoryEngine Hierarchical Tree Representation & Stitching

### 3.1 The Hierarchical Trajectory Challenge

In existing `suna_harness.js` (lines 1745–1873), `TrajectoryEngine` records a single flat array: `this.events = []`. When each step is logged, `makeImmutableEvent` deeply freezes the event object (`Object.freeze(result)`).

If sub-harnesses run concurrently or sequentially, dumping child events directly into the parent array causes:
1. **Attribution Loss**: Inability to differentiate which agent role executed what tool.
2. **Index Collision**: Child step 1 clashing with parent step 1.
3. **Immutability Violation**: Attempting to attach child arrays onto an already frozen parent step will throw `TypeError: Cannot assign to read only property`.

### 3.2 `TrajectoryTreeNode` Schema

To resolve this cleanly, we introduce the `TrajectoryTreeNode` data model:

```typescript
interface TrajectoryTreeNode {
  id: string;                         // `evt_step_${stepIndex}_${epochMs}`
  harnessId: string;                  // ID of the harness emitting the step ('root', 'sub_coder_1')
  parentHarnessId: string | null;     // null for root harness, parent's ID for child
  depth: number;                      // 0 = root, 1 = child, 2 = grandchild...
  role: string;                       // 'root' | 'planner' | 'coder' | 'reviewer' | ...
  stepIndex: number;                  // Local 1-indexed step inside this harness
  globalStepIndex: number;            // Chronological global step across the whole system
  type: 'step' | 'spawn' | 'complete' | 'error';
  timestamp: string;                  // ISO UTC
  epochMs: number;
  thought: string;
  action: {
    tool: string;
    params: Record<string, any>;
  };
  observation: {
    status: 'success' | 'error';
    result?: any;
    error?: string;
  };
  metrics: {
    durationMs: number;
    tokensConsumed: number;
    tokenUsage: { total: number };
  };
  status: 'success' | 'error';
  children: TrajectoryTreeNode[];     // Recursive sub-trajectories
  sub_trajectory?: {                  // Present on spawn nodes
    childHarnessId: string;
    role: string;
    mode: string;
    stepCount: number;
    tokensUsed: number;
    durationMs: number;
    summary?: string;
  } | null;
  metadata: Record<string, any>;
}
```

### 3.3 Trajectory Stitching Architecture (`stitchChildTrajectory`)

The stitching mechanism bridges child trajectories into the parent tree using a dual-reference index:

1. **Child Trajectory Registry**:
   `this.childTrajectories = new Map()`:
   Stores `{ childHarnessId, anchorStepId, events, metadata }`.
2. **Anchor Association**:
   - When a parent spawns a child (`spawnSubHarness`), the parent logs a step of tool `'spawnSubHarness'` or type `'spawn'`. The step's `id` becomes the anchor.
   - When `stitchChildTrajectory(childHarnessId, childEventsOrEngine, options)` is called:
     - If `options.anchorStepId` is specified, it binds to that exact step.
     - If not specified, it searches backwards in `this.events` for the step where `action.tool === 'spawnSubHarness'` and `action.params.subHarnessId === childHarnessId`.
     - If still not found, it binds to the last recorded parent step, or creates a synthetic delegation step.
3. **Immutability Preservation**:
   - The raw event log `this.events` remains immutable (frozen).
   - `getHierarchicalTree()` dynamically constructs the nested tree from `this.events` and `this.childTrajectories`, returning freshly assembled, fully navigable `TrajectoryTreeNode` hierarchies.

```
[Parent Event Stream]
Step 1: view_file("src/app.js")
Step 2: spawnSubHarness("coder", "branch") <---------+ [Anchor Point]
Step 3: mergeSubHarness("sub_coder_1")                |
Step 4: run_sandboxed_command("npm test")             |
                                                      |
[Child Event Stream: sub_coder_1]                     |
Child Step 1: grep_search("handleError") -------------+
Child Step 2: replace_file_content(...) --------------+
Child Step 3: completed ------------------------------+
```

### 3.4 Method Specifications for `TrajectoryEngine`

#### 1. `stitchChildTrajectory(childHarnessId, childEventsOrEngine, options = {})`
```javascript
stitchChildTrajectory(childHarnessId, childEventsOrEngine, options = {}) {
  if (!childHarnessId) {
    throw new Error('[TrajectoryEngine] childHarnessId is required for stitching');
  }

  let rawChildEvents = [];
  if (Array.isArray(childEventsOrEngine)) {
    rawChildEvents = childEventsOrEngine;
  } else if (childEventsOrEngine && typeof childEventsOrEngine.getEvents === 'function') {
    rawChildEvents = childEventsOrEngine.getEvents();
  } else if (childEventsOrEngine && typeof childEventsOrEngine.getTrajectory === 'function') {
    rawChildEvents = childEventsOrEngine.getTrajectory();
  }

  // Find anchor step in parent events
  let anchorStepId = options.anchorStepId || null;
  if (!anchorStepId) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (
        (e.action && (e.action.tool === 'spawnSubHarness' || e.action.tool === 'spawn') &&
         (e.action.params && (e.action.params.subHarnessId === childHarnessId || e.action.params.id === childHarnessId))) ||
        (e.sub_trajectory && e.sub_trajectory.childHarnessId === childHarnessId)
      ) {
        anchorStepId = e.id;
        break;
      }
    }
  }

  // If still no anchor, default to the latest step or create anchor entry
  if (!anchorStepId && this.events.length > 0) {
    anchorStepId = this.events[this.events.length - 1].id;
  }

  const stitchedRecord = {
    childHarnessId: String(childHarnessId),
    anchorStepId,
    role: options.role || (rawChildEvents[0] && rawChildEvents[0].role) || 'sub-agent',
    events: rawChildEvents,
    stitchedAt: Date.now(),
    metadata: options.metadata || {}
  };

  this.childTrajectories.set(String(childHarnessId), stitchedRecord);

  // Notify listeners of the stitching event
  this.emit('stitch', stitchedRecord);

  return stitchedRecord;
}
```

#### 2. `getHierarchicalTree(options = {})`
```javascript
getHierarchicalTree(options = {}) {
  const rootHarnessId = options.rootHarnessId || this.harnessId || 'root';
  let globalStepCounter = 1;

  // Helper: map a raw event to a TrajectoryTreeNode
  const mapToNode = (rawEvt, depth = 0, parentHarnessId = null) => {
    const node = {
      id: rawEvt.id || `evt_node_${globalStepCounter}`,
      harnessId: rawEvt.harnessId || rawEvt.agent_id || (depth === 0 ? rootHarnessId : 'sub-agent'),
      parentHarnessId: parentHarnessId,
      depth: depth,
      role: rawEvt.role || (depth === 0 ? 'root' : 'worker'),
      stepIndex: rawEvt.step_index !== undefined ? rawEvt.step_index : rawEvt.step || 1,
      globalStepIndex: globalStepCounter++,
      type: rawEvt.type || (rawEvt.action && rawEvt.action.tool === 'spawnSubHarness' ? 'spawn' : 'step'),
      timestamp: rawEvt.timestamp || new Date().toISOString(),
      epochMs: rawEvt.epoch_ms || Date.now(),
      thought: rawEvt.thought || '',
      action: rawEvt.action || { tool: 'unknown', params: {} },
      observation: rawEvt.observation || { status: 'success', result: null },
      metrics: {
        durationMs: (rawEvt.metrics && (rawEvt.metrics.durationMs || rawEvt.metrics.duration_ms)) || 0,
        tokensConsumed: (rawEvt.metrics && (rawEvt.metrics.tokensConsumed || (rawEvt.metrics.tokenUsage && rawEvt.metrics.tokenUsage.total))) || 0,
        tokenUsage: (rawEvt.metrics && rawEvt.metrics.tokenUsage) || { total: 0 }
      },
      status: rawEvt.status || 'success',
      children: [],
      sub_trajectory: rawEvt.sub_trajectory || null,
      metadata: rawEvt.metadata || {}
    };

    return node;
  };

  // Build anchor mapping: anchorStepId -> Array<stitchedRecord>
  const anchorMap = new Map();
  this.childTrajectories.forEach((record) => {
    const anchor = record.anchorStepId || '__root_tail__';
    if (!anchorMap.has(anchor)) anchorMap.set(anchor, []);
    anchorMap.get(anchor).push(record);
  });

  const tree = [];

  // Iterate over root events
  this.events.forEach(evt => {
    const rootNode = mapToNode(evt, 0, null);

    // Check if any child sub-harnesses are anchored to this step
    if (anchorMap.has(rootNode.id)) {
      const records = anchorMap.get(rootNode.id);
      records.forEach(rec => {
        let childTokens = 0;
        let childDuration = 0;

        rec.events.forEach(childEvt => {
          const childNode = mapToNode(childEvt, 1, rootNode.harnessId);
          childNode.role = rec.role || childNode.role;
          childTokens += childNode.metrics.tokensConsumed;
          childDuration += childNode.metrics.durationMs;
          rootNode.children.push(childNode);
        });

        // Set sub_trajectory metadata on parent node
        rootNode.sub_trajectory = {
          childHarnessId: rec.childHarnessId,
          role: rec.role,
          stepCount: rec.events.length,
          tokensUsed: childTokens,
          durationMs: childDuration,
          metadata: rec.metadata
        };
      });
    }

    tree.push(rootNode);
  });

  // Handle unanchored child records (append to synthetic node if needed)
  if (anchorMap.has('__root_tail__')) {
    const unanchored = anchorMap.get('__root_tail__');
    unanchored.forEach(rec => {
      const syntheticNode = mapToNode({
        step_index: this.events.length + 1,
        type: 'spawn',
        action: { tool: 'delegated_execution', params: { childHarnessId: rec.childHarnessId } },
        thought: `Delegated sub-task executed by ${rec.childHarnessId}`
      }, 0, null);

      rec.events.forEach(childEvt => {
        syntheticNode.children.push(mapToNode(childEvt, 1, syntheticNode.harnessId));
      });
      tree.push(syntheticNode);
    });
  }

  return tree;
}
```

#### 3. `getFlattenedTimeline(options = {})`
Performs depth-first pre-order traversal across `getHierarchicalTree()`, generating display-ready hierarchical markers (e.g. `2.1`, `2.2`):
```javascript
getFlattenedTimeline(options = {}) {
  const tree = this.getHierarchicalTree(options);
  const timeline = [];

  const traverse = (node, prefix) => {
    const displayIndex = prefix ? `${prefix}.${node.stepIndex}` : `${node.stepIndex}`;
    timeline.push(Object.assign({}, node, {
      hierarchicalIndex: displayIndex,
      indentText: '  '.repeat(node.depth),
      badgeText: `[${node.role.toUpperCase()}]`
    }));

    if (Array.isArray(node.children)) {
      node.children.forEach(child => traverse(child, displayIndex));
    }
  };

  tree.forEach(rootNode => traverse(rootNode, ''));
  return timeline;
}
```

#### 4. Backward-Compatible Extended `exportMarkdown(optionsOrTitle)`
```javascript
exportMarkdown(optionsOrTitle = 'SunaHarness Trajectory Execution Summary') {
  const isObj = typeof optionsOrTitle === 'object' && optionsOrTitle !== null;
  const title = isObj ? (optionsOrTitle.title || 'SunaHarness Trajectory Execution Summary') : optionsOrTitle;
  const hierarchical = isObj && Boolean(optionsOrTitle.hierarchical);

  if (!hierarchical) {
    // 100% exact backward-compatible markdown rendering (lines 1815-1871 in existing file)
    return this._exportFlatMarkdown(title);
  }

  const timeline = this.getFlattenedTimeline();
  let md = `# ${title}\n\n`;
  md += `**Execution Date:** ${new Date().toISOString()}  \n`;
  md += `**Total Steps:** ${timeline.length} (Hierarchical)  \n\n`;

  md += `## Hierarchical Trajectory Timeline\n\n`;
  md += `| Step | Role | Tool | Status | Duration | Observation Summary |\n`;
  md += `| :---: | :---: | :--- | :---: | :---: | :--- |\n`;

  timeline.forEach(item => {
    const indent = item.depth > 0 ? '&nbsp;&nbsp;'.repeat(item.depth) + '↳ ' : '';
    const tool = item.action ? item.action.tool : 'N/A';
    const status = item.status === 'success' ? 'PASS' : 'FAIL';
    const dur = `${item.metrics.durationMs}ms`;
    let obs = 'Success';
    if (item.observation) {
      if (typeof item.observation.result === 'string') {
        obs = item.observation.result.slice(0, 35).replace(/\n/g, ' ') + '...';
      } else if (item.observation.error) {
        obs = `Error: ${String(item.observation.error).slice(0, 30)}...`;
      }
    }
    md += `| ${item.hierarchicalIndex} | \`${item.role}\` | ${indent}\`${tool}\` | ${status} | ${dur} | ${obs} |\n`;
  });

  return md;
}
```

---

## 4. Concrete Hook Points in `suna_harness.js`

### 4.1 Insertion Map in `suna_harness.js`

```
d:\Suna Chat\suna_harness.js
│
├── [HOOK POINT 1: Line 1547]
│   └── INSERT: class InterHarnessEventBus (Full bus implementation)
│   └── INSERT: const HarnessEventBus = InterHarnessEventBus;
│
├── [HOOK POINT 2: Lines 1552-1740] (HarnessController)
│   ├── Enhance constructor(options):
│   │   - this.bus = options.bus || new InterHarnessEventBus();
│   │   - this.id = options.id || options.harnessId || 'root';
│   │   - this.role = options.role || 'orchestrator';
│   │   - this.depth = options.depth || 0;
│   │   - this.parentId = options.parentId || null;
│   │   - this.children = new Map();
│   │   - Subscribe controller to this.bus for directives, queries, emergency stops.
│   │
│   ├── Add method sendDirective(childId, instruction, context)
│   ├── Add method requestStatus(childId)
│   └── Add method emergencyStopSubHarness(childId, reason)
│
├── [HOOK POINT 3: Lines 1745-1873] (TrajectoryEngine)
│   ├── Enhance constructor(options):
│   │   - this.childTrajectories = new Map();
│   │   - this.harnessId = (options && options.harnessId) || 'root';
│   │   - this.role = (options && options.role) || 'root';
│   │
│   ├── Enhance recordStep(stepData):
│   │   - Accept optional fields: role, agent_id, parent_step_id, depth, sub_trajectory
│   │
│   ├── Add method stitchChildTrajectory(childHarnessId, childEventsOrEngine, options)
│   ├── Add method getHierarchicalTree(options)
│   ├── Add method getFlattenedTimeline(options)
│   └── Enhance exportMarkdown(optionsOrTitle) with hierarchical support
│
└── [HOOK POINT 4: Lines 3092-3258] (SunaHarness Public Facade)
    ├── Export InterHarnessEventBus and HarnessEventBus
    └── Enhance createHarness(options):
        - Instantiate shared or dedicated InterHarnessEventBus
        - Wire spawnSubHarness, mergeSubHarness, stitchChildTrajectory onto instance
```

---

## 5. Verification & Test Plan for M1_2

### 5.1 New Unit & Integration Test Specifications (`tests/test_suna_harness.js`)

| Test ID | Test Category | Target Subsystem | Assertion Description |
| :--- | :--- | :--- | :--- |
| **M1-BUS-01** | Feature | `InterHarnessEventBus` | Subscribes to targeted `harnessId` and successfully receives direct point-to-point message. |
| **M1-BUS-02** | Feature | `InterHarnessEventBus` | Broadcasts with `to: '*'` and verifies all subscribers (parent + children) receive the event. |
| **M1-BUS-03** | Envelope | `InterHarnessEventBus` | Validates structured payload for `directive`, `status_query`, `emergency_stop`. |
| **M1-BUS-04** | Envelope | `InterHarnessEventBus` | Validates telemetry payloads for `progress`, `completed`, and `failed`. |
| **M1-BUS-05** | Request/Resp | `InterHarnessEventBus` | `bus.request()` sends `status_query` and resolves with corresponding `response` matching `correlationId`. |
| **M1-BUS-06** | Resilience | `InterHarnessEventBus` | Subscriber callback throwing an exception does NOT crash bus or prevent other subscribers from receiving message. |
| **M1-BUS-07** | Boundary | `InterHarnessEventBus` | Sending to non-existent harness logs to history and returns `delivered: false` without throwing. |
| **M1-TRAJ-01** | Feature | `TrajectoryEngine` | `stitchChildTrajectory()` successfully attaches child events to parent spawn step. |
| **M1-TRAJ-02** | Structure | `TrajectoryEngine` | `getHierarchicalTree()` returns array of root nodes where child events are nested in `.children`. |
| **M1-TRAJ-03** | Traversal | `TrajectoryEngine` | `getFlattenedTimeline()` generates hierarchical numbering (`1`, `2`, `2.1`, `2.2`, `3`). |
| **M1-TRAJ-04** | Immutability| `TrajectoryEngine` | Raw event stream remains frozen (`Object.isFrozen`) while tree projection returns mutable, navigable nodes. |
| **M1-TRAJ-05** | Recursion | `TrajectoryEngine` | Deep nesting ($\ge 5$ levels) constructs valid multi-tiered tree without call stack overflow. |
| **M1-TRAJ-06** | Exporter | `TrajectoryEngine` | `exportMarkdown({ hierarchical: true })` produces nested bullet list with `[ROLE]` badges. |

### 5.2 Zero-Regression Verification Gate
- Run `node -c suna_harness.js` $\to$ must return code 0.
- Run `npx mocha tests/test_suna_harness.js` $\to$ all 149 existing tests + new M1 tests must pass 100%.
- Run `npm test` $\to$ all 982 tests across 38 files must pass with 0 failures.
- Run `python run_verification.py` $\to$ 100% green.

---
*End of Strategy Document — Ready for Implementation Phase.*
