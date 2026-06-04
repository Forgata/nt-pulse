# NT-Pulse v2

**NT-Pulse** is a high-performance, distributed network throughput and saturation engine. Version 2 transitions the architecture from a CLI-bound utility to a highly concurrent, browser-compatible Edge Computing mesh.

Designed to bypass application-layer bottlenecks like disk I/O and main-thread CPU blocking, NT-Pulse measures the absolute maximum capacity of a network link using cryptographically secured, memory-mapped WebSocket streaming and a decoupled Web Worker execution pool.

## Overview

The system is decoupled into four distinct operational tiers to ensure the measurement execution thread is never blocked by control-plane routing or observability overhead.

### 1. Execution Client (Browser UI & Worker Pool)

A clinical, lightweight frontend that orchestrates a strict network saturation lifecycle without blocking the DOM rendering thread:

- **Geo-Discovery:** Leverages native browser geolocation APIs to establish the client's footprint, routing these vectors to the Orchestrator to secure a proximity-optimized, HMAC-SHA256 authenticated execution token.
- **Worker Concurrency:** Spawns a pool of 6 parallel Web Workers to handle the heavy I/O of incoming data streams, completely bypassing browser single-thread limitations.
- **TCP Warmup (The Pipe Squeeze):** Connects WebSockets and discards initial byte counts to force the operating system's TCP Congestion Window past the exponential "Slow-Start" phase.
- **Active Sampling:** A high-resolution microsecond window that counts raw byte arrivals across all worker threads via atomic message passing.
- **Telemetry Offload:** Terminates worker threads instantly upon completion to free memory, and asynchronously ships final JSON diagnostics back to the Orchestrator.

### 2. The Orchestration Gateway

The central intelligence of the mesh, built in Node.js. It operates entirely out-of-band from the speed test data:

- **Registry & Heartbeats:** Maintains an active memory map of online Edge Nodes. It enforces a strict 30-second TTL (Time-To-Live) boundary, instantly pruning nodes that fail to send their 15-second `/register` heartbeat.
- **Haversine Routing:** Evaluates incoming client coordinates in real-time, executing a Haversine distance matrix to dynamically pair the client with the closest active edge deployment pool (e.g., `edge-blantyre`).
- **Security:** Issues time-restricted (`exp`) cryptographic tokens to prevent unauthorized bandwidth consumption.

### 3. The Secured Edge Node

This is the data plane.
The heavy-lifting server infrastructure deployed at the edge. To eliminate file-system read latency and SSD bottlenecks, the Edge Node utilizes a Zero-Allocation memory strategy:

- **RAM Buffering:** Pre-allocates a static 50MB uninitialized chunk of system RAM (`Buffer.allocUnsafe()`) at boot.
- **WebSocket Streaming:** Authenticates incoming client tokens via the query string and streams the raw RAM buffer in 64KB sequential chunks infinitely over the `ws://` pipe.
- **Dual-Plane:** Listens on HTTP (Port 4001) for initialization and topology resolution, while isolating high-throughput WebSocket traffic to a dedicated port (Port 4002).

### 4. The Analytics & Metrics Layer

An out-of-band ingestion pipeline integrated directly into the Orchestrator. When a client finishes a test run, it fires a `POST /telemetry` payload containing final Mbps throughput and execution duration. This data is exposed via a `/metrics` route to monitor global infrastructure saturation and node health.

---

## NT-Pulse vs Fast.com

NT-Pulse shares its core mathematical philosophy with Fast.com (Netflix's speed tester) but diverges in its execution environment to achieve precise network-layer saturation.

### The Similarities

- **TCP Slow-Start Bypassing:** Both engines recognize that starting a timer at byte 0 yields deflated metrics. Both utilize an unmeasured "Warmup Phase" to force network hardware to reach peak capacity before sampling begins.
- **Concurrency:** Both tools utilize parallel connection pipelines to fully saturate the Network Interface Card (NIC), ensuring a single blocked socket thread cannot throttle the calculation.
- **Real-World Saturation:** Neither uses artificial packet pinging (like ICMP). Both measure actual application payload transfers over standard web transport layers.

### The Differences

| Architectural Vector   | NT-Pulse v2                                                                                              | Fast.com                                                                                                          |
| :--------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Execution Sandbox**  | **Web Worker Pool**. Isolates network streams in background threads, keeping the UI clinically smooth.   | **Main Browser Thread**. Subject to heavier DOM overhead and standard browser event-loop queuing.                 |
| **Data Sourcing**      | **Uninitialized RAM Buffer**. Bypasses filesystem I/O entirely. Server streams a constant steady-state.  | **Netflix OCA CDN**. Pulls static media chunks from edge storage appliances.                                      |
| **Memory Allocation**  | **Zero-Retention Workers**. Drops incoming packets instantly inside the worker, minimizing V8 GC pauses. | **Browser Array Buffers**. Retains chunks temporarily, occasionally triggering browser Garbage Collection spikes. |
| **Security & Routing** | **HMAC-SHA256 Token Gates**. Real-time geometric proximity routing via Orchestrator API.                 | **Anycast GeoDNS**. Relies on global DNS infrastructure to route traffic to the closest datacenter.               |

---

## Getting Started

Ensure you have a recent version of Node.js installed. NT-Pulse utilizes standard module imports and minimal dependencies.

```bash
npm install
```

### 1. Boot the Orchestrator

Start the central routing and registry gateway on Port 4000:

```bash
npm run orchestrator
# or node --experimental-specifier-resolution=node dist/orchestrator.js

```

### 2. Boot the Edge Node (Data Plane)

Start an Edge deployment. It will automatically resolve its public IP/ISP, register with the Orchestrator, and begin sending 15-second heartbeats:

```bash
npm run edge
# or node --experimental-specifier-resolution=node dist/server.js

```

### 3. Launch the Client UI

Serve the `index.html` frontend using any static HTTP server (e.g., VS Code Live Server, Python `http.server`, or `serve`):

```bash
npx serve ./public -p 5500

```

Open your browser, allow Location access for optimal Haversine routing, and trigger the saturation test to view real-time Mbps telemetry.

### **[READ THE ARCHITECTURE.md](./ARCHITECTURE.md)**
