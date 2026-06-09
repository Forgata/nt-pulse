# NT-Pulse v2.1

**NT-Pulse** is a high-performance, distributed network throughput and saturation engine. Version 2.1 transitions the architecture from a CLI-bound local prototype to a highly concurrent, production-grade Edge Computing mesh with fault-tolerant heartbeat mechanisms and dual-plane infrastructure hosting.

Designed to bypass application-layer bottlenecks like disk I/O and main-thread CPU blocking, NT-Pulse measures the absolute maximum capacity of a network link using cryptographically secured, memory-mapped WebSocket streaming and a decoupled Web Worker execution pool.

## Architecture Overview

The system is decoupled into four distinct operational tiers to ensure the measurement execution thread is never blocked by control-plane routing or observability overhead.

### 1. Execution Client (Browser UI & Worker Pool)

A clinical, lightweight frontend that orchestrates a strict network saturation lifecycle without blocking the DOM rendering thread:

- **Geo-Discovery:** Leverages native browser geolocation APIs to establish the client's footprint. These vectors are routed to the Orchestrator to secure a proximity-optimized, HMAC-SHA256 authenticated execution token.
- **Worker Concurrency:** Spawns a pool of 6 parallel Web Workers to handle the heavy I/O of incoming data streams, completely bypassing browser single-thread limitations.
- **TCP Warmup (The Pipe Squeeze):** Connects WebSockets and discards initial byte counts to force the OS TCP Congestion Window past the exponential "Slow-Start" phase.
- **Active Sampling:** A high-resolution microsecond window that counts raw byte arrivals across all worker threads via atomic message passing.
- **Telemetry Offload:** Terminates worker threads instantly upon completion to free memory and asynchronously ships final JSON diagnostics back to the Orchestrator.

### 2. Orchestration Gateway

The central intelligence of the mesh, built in Node.js. It operates entirely out-of-band from the speed test data:

- **Registry & Heartbeats:** Maintains an active memory map of online Edge Nodes. It enforces a strict 30-second TTL (Time-To-Live) boundary, pruning nodes that fail to pulse every 15 seconds.
- **Haversine Routing:** Evaluates incoming client coordinates in real-time, executing a Haversine distance matrix to dynamically pair the client with the closest active edge deployment pool.
- **Security:** Issues time-restricted cryptographic tokens to prevent unauthorized bandwidth consumption.

### 3. Secured Edge Node

The data plane infrastructure. To eliminate file-system read latency and SSD bottlenecks, the Edge Node utilizes a Zero-Allocation memory strategy:

- **RAM Buffering:** Pre-allocates a static 50MB uninitialized chunk of system RAM (`Buffer.allocUnsafe()`) at boot.
- **WebSocket Streaming:** Authenticates incoming client tokens via the query string and streams the raw RAM buffer in 64KB sequential chunks infinitely over the `wss://` pipe.
- **Dual-Plane:** Listens on HTTP (Port 4001) for initialization and topology resolution, while isolating high-throughput WebSocket traffic to a dedicated port (Port 4002).

### 4.Serverless AI Diagnostics (New in v2.2.0)

Hosted securely on Vercel's Edge network, a dedicated Node.js serverless function (/api/speed-summary.js) safely proxies final telemetry metrics to Google's ultra-low-latency gemini-3.1-flash-lite model.

- Sub-Second TTFT: Provides instant, single-sentence network engineering insights.

- Credential Isolation: Keeps the GEMINI_API_KEY entirely shielded from the client browser within a secure backend container.

### 5. Analytics

An out-of-band ingestion pipeline integrated directly into the Orchestrator. When a client finishes a test run, it fires a `POST /telemetry` payload containing final Mbps throughput and execution duration. This data is exposed via a `/metrics` route to monitor global infrastructure saturation and node health.

---

## Deployment & Configuration

For production, the Frontend (UI) and Backend (Orchestrator/Nodes) are decoupled.

### 1. Environment Variables

Ensure these variables are configured in your hosting environment (Render/Vercel):

| Variable               | Required | Description                                                                        |
| ---------------------- | -------- | ---------------------------------------------------------------------------------- |
| `ORCHESTRATION_SECRET` | Yes      | 32+ char string for HMAC-SHA256 token signing.                                     |
| `GATEWAY_URL`          | Yes      | The URL of your Orchestrator (e.g., `https://nt-pulse-orchestrator.onrender.com`). |
| `RENDER_EXTERNAL_URL`  | Yes      | Set to your public-facing URL (used by Edge Nodes to register).                    |
| `GEMINI_API_KEY`       | Yes      | Google AI token for the Serverless Diagnostics engine(Vercel).                     |

### 2. Development (Local Mode)

To run the full stack locally for testing:

```bash
# 1. Boot Orchestrator (Port 4000)
npm run orchestrator

# 2. Boot Edge Node (Port 4001/4002)
npm run edge

# 3. Serve UI
npx serve ./public -p 5500

```

### 3. Production Deployment

- **Backend (Orchestrator & Edge):** Deploy to a platform like Render. Ensure `ORCHESTRATION_SECRET` is set in the dashboard.
- **Frontend (UI):** Deploy the `public` directory to Vercel. Ensure `GATEWAY_URL` is set in Vercel's Environment Variables. Vercel will serve the site over HTTPS, and the application will automatically enforce `wss://` for WebSocket connections.

---

## NT-Pulse vs Fast.com

| Architectural Vector   | NT-Pulse v2.1                                                                                            | Fast.com                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Execution Sandbox**  | **Web Worker Pool**. Isolates network streams in background threads, keeping the UI clinically smooth.   | **Main Browser Thread**. Subject to heavier DOM overhead and standard browser event-loop queuing.                 |
| **Data Sourcing**      | **Uninitialized RAM Buffer**. Bypasses filesystem I/O entirely. Server streams a constant steady-state.  | **Netflix OCA CDN**. Pulls static media chunks from edge storage appliances.                                      |
| **Memory Allocation**  | **Zero-Retention Workers**. Drops incoming packets instantly inside the worker, minimizing V8 GC pauses. | **Browser Array Buffers**. Retains chunks temporarily, occasionally triggering browser Garbage Collection spikes. |
| **Security & Routing** | **HMAC-SHA256 Token Gates**. Real-time geometric proximity routing via Orchestrator API.                 | **Anycast GeoDNS**. Relies on global DNS infrastructure to route traffic to the closest datacenter.               |

---

## Documentation

- **[Full Architecture Specification](/ARCHITECTURE.md)**
- **[Security & Privacy Policy](./SECURITY.md)**
