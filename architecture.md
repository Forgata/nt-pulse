# Architecture: NT-Pulse

NT-Pulse is a production-grade, distributed real-time network throughput engine engineered in Node.js and TypeScript. It replicates the core architectural patterns of [Fast.com](https://fast.com/) to isolate, measure, and calculate raw bandwidth metrics by eliminating platform overhead and transport layer initialization artifacts.

## 1. Core Mathematics

At its foundation, NT-Pulse measures **Bytes over Time ($B/t$)** during a state of total network link saturation.

$$\text{Throughput (Mbps)} = \frac{\text{Payload Size (Bytes)} \times 8}{\text{Sustained Window Time (Seconds)} \times 1,000,000}$$

- **The Numerator (Bytes):** Represents the actual network payload size transferred through the network card interface, completely omitting filesystem cache read states or client runtime heap layer mutations.\* **The Denominator (Time):** Is strictly isolated to the steady-state tracking window where the TCP pipe is fully opened and saturated. This duration intentionally discards the connection handshake latencies and initial window ramp-ups.

---

## 2. Architecture

┌─────────────────────────┐
│ 1. Client Application │
│ (CLI / Web / Desktop) │
└────────────┬────────────┘
│
Get Closest Edges (HTTPS)
│
▼
┌─────────────────────────┐
│ 2. Orchestration Tier │
│ (API Gateway / Auth) │
└────────────┬────────────┘
│
Queries Optimal Nodes
│
▼
┌────────────────────────────┴────────────────────────────┐
│ 3. Distributed Edge Target Network │
├───────────────────┬───────────────────┬─────────────────┤
│ Edge Node A │ Edge Node B │ Edge Node C │
│ (US-East) │ (EU-West) │ (Asia-East) │
│ [RAM Streamer] │ [RAM Streamer] │ [RAM Streamer] │
└───────────────────┴───────────────────┴─────────────────┘
│
Telemetry Data Logs (Async Worker)
│
▼
┌─────────────────────────┐
│ 4. Analytics Layer │
│ (TimescaleDB / Redis) │
└─────────────────────────┘

---

## 3. Architectural Breakdown

### Tier 1: The Client Engine

The client application functions as an isolated I/O stress tester. Its lone objective is to intentionally flood the local network path to capacity and track packet ingestion.

- **Responsibilities:**
  - Initiating pre-flight handshakes to evaluate baseline routing latency profiles.
  - Multiplexing connections via 4–8 concurrent HTTP/TCP sockets to saturate physical link capacity.
  - Handling atomic aggregate byte collection without introducing thread-blocking bottlenecks.
  - Emitting telemetry events at fixed intervals (e.g., every 200ms) to drive live UI updates.
- **Key Design Pattern:** **Non-Blocking Worker Pools.** Implemented using native Node.js HTTP stream handlers explicitly configured with `agent: false`. This bypasses connection pool reuse policies and forces the operating system to open raw, independent sockets.

### Tier 2: The Orchestration

A lightweight API gateway that functions as the central registry, traffic cop, and authorization wall. Clients must query this tier to discover safe targets before initiating a benchmark run.

- **Responsibilities:**
  - Authenticating incoming client requests and enforcing rate-limiting boundaries to prevent service degradation.
  - Parsing the client's public ingress IP address to resolve geographic coordinates using a low-latency MaxMind/GeoIP layer.
  - Running path-sorting logic to match the client with the 3 most optimal edge target nodes.
- **Key Design Pattern:** **Topology-Aware Geographic Routing.** Computes network topological distance and sorts the node array based on geographic coordinates via the Haversine formula, using a fast Redis layer to cache live node availability states.

### Tier 3: The Distributed Edge Network

Minimal, hyper-optimized infrastructure instances deployed globally at internet exchange points or edge cloud providers. These nodes handle raw data traffic with zero compute overhead.

- **Responsibilities:**
  - Streaming high-volume, endless dummy download streams without hitting local system disks.
  - Providing an execution black hole endpoint for incoming client upload streams.
- **Key Design Pattern:** **Zero-Allocation Memory Stream Handlers.** On boot, the server allocates a fixed-size buffer block (e.g., 50MB of randomized bits) directly inside system RAM. All incoming client download streams point straight to this memory buffer using zero-copy stream chunking, isolating performance bottlenecks to the network hardware interface.

### Tier 4: The Analytics & Logging Layer

An out-of-band data engine designed to record and process telemetry tracking info without interrupting active clients.

- **Responsibilities:**
  - Ingesting completed speed metrics logs sent asynchronously from client sessions.
  - Aggregating metrics by provider, ASN, region, and time to generate network performance profiles.
- **Key Design Pattern:** **Asynchronous Message Queuing.** Edge nodes and clients dump execution telemetry records to a decoupled message pipeline. Worker routines ingest these items into a time-series storage backend (like TimescaleDB), completely decoupling database write locks from active speed test sessions.

---

## 4. Lifecycle

Whenever an NT-Pulse testing cycle is triggered, it transitions through five distinct sequential phases:

[Phase 1: Handshake] ────> [Phase 2: Latency] ────> [Phase 3: Warmup] ────> [Phase 4: Sample] ────> [Phase 5: Finalize]
Auth & Discovery Ping & Jitter TCP Window Bytes Over Time Calculate & Kill

### Phase 1: Handshake & Discovery

The client issues a secure HTTPS call to Tier 2 (Orchestration). The API handles token exchange and geolocation mapping, then returns an optimization package containing a signed access token and the routing endpoints of the three nearest Edge Target Nodes.

### Phase 2: Pre-Flight Latency

Before data streams open, the client fires 5 consecutive HTTP `HEAD` or `OPTIONS` requests to the primary assigned edge endpoint. The runtime tracks network round-trip delays to extract two initial baseline parameters:

- **Ping:** The arithmetic mean of the connection loop times.
- **Jitter:** The statistical variance between those loop times.

### Phase 3: Pipe Squeeze

The client launches its multi-threaded connection worker pool, making simultaneous download requests against the Edge Node. Data streams down for 1.5 to 2.0 seconds. During this window, **all byte counters are ignored**. This gives the client-side environment and the OS transport layer time to scale up the TCP Window Size via the TCP Slow-Start protocol, bringing the path to full saturation.

### Phase 4: Active Sampling Window

The measurement window opens. The client starts a high-resolution microsecond timer (`performance.now()`) and enables active metric aggregation. As data streams through the concurrent worker sockets, incoming packet lengths are instantly appended to a central atomic counter. In parallel, a decoupled timer triggers every 200ms to calculate interim throughput and pass real-time speed data to the interface.

### Phase 5: Teardown & Finalization

When the execution timer (e.g., 5000ms) expires, the client closes all active connection streams immediately to free system memory. It calculates final throughput against the isolated sampling window metrics and prints the summary. It then sends an out-of-band diagnostic payload back to the analytics layer before exiting cleanly.
