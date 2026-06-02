# NT-Pulse

**NT-Pulse** is a high-performance, zero-dependency distributed network throughput and saturation engine built natively in Node.js and TypeScript.

Designed to bypass application-layer bottlenecks like disk I/O and V8 Garbage Collection, NT-Pulse measures the absolute maximum capacity of a network link using cryptographically secured, memory-mapped socket streaming.

## Overview

The system is decoupled into four distinct operational tiers to ensure the measurement execution thread is never blocked by control-plane or observability overhead.

### 1. The Execution Client (`src/client.ts`)

A lightweight native engine that orchestrates a strict 5-phase network saturation lifecycle:

- **Discovery:** Queries an out-of-band topology gateway to automatically reflect client network variables (ISP, latitude, longitude) and maps these vectors against the Orchestrator to secure a proximity-optimized, HMAC-SHA256 authenticated token.
- **Baseline Calibration:** Executes isolated `HEAD` requests to establish base Ping and Jitter.
- **TCP Warmup (The Pipe Squeeze):** Blasts open 6 concurrent sockets for 2 seconds to force the operating system's TCP Window Size past the exponential "Slow-Start" phase.
- **Active Sampling:** A strict 5-second, high-resolution microsecond window that counts raw byte arrivals directly off the network interface card.
- **Offload:** Destroys sockets instantly and ships JSON diagnostics asynchronously out-of-band.

### 2. The Orchestration Gateway (`src/orchestrator.ts`)

The central control plane of the mesh. It handles Edge Node registration heartbeats, ingest streams, and short-lived cryptographic token generation. It evaluates incoming client coordinates using a real-time Haversine distance calculation to dynamically pair the client with the closest active edge deployment pool (e.g., `edge-blantyre`), completely eliminating the need for fixed or hardcoded routing maps.

### 3. The Secured Edge Node (`src/server.ts`)

The heavy-lifting data plane. To eliminate file-system read latency and SSD bottlenecks, the Edge Node pre-allocates a 50MB uninitialized static chunk of system RAM (`Buffer.allocUnsafe()`) at boot. It authenticates incoming client tokens and blasts this raw memory buffer infinitely over the wire, achieving complete link saturation with zero garbage collection overhead.

### 4. The Observability Dashboard (`src/dashboard.ts`)

A standalone CLI utility that polls the Orchestrator's metric cache. It provides a real-time, terminal-based visual matrix of active nodes and historical throughput logs without interfering with the client's execution thread.

## NT-Pulse vs Fast.com

NT-Pulse shares its core mathematical philosophy with Fast.com (Netflix's speed tester), but diverges significantly in its execution environment to achieve lower-level hardware precision.

### The Similarities

- **TCP Slow-Start Bypassing:** Both engines recognize that starting a timer at byte 0 yields deflated metrics. Both utilize an unmeasured "Warmup Phase" to force network hardware to reach peak capacity before sampling begins.
- **Concurrency:** Both tools utilize parallel connection pipelines to fully saturate the Network Interface Card (NIC), ensuring a single blocked socket thread cannot throttle the calculation.
- **Real-World L7 Saturation:** Neither uses artificial packet pinging (like ICMP). Both measure actual HTTP payload transfers over standard web transport layers.

### The Differences

| Architectural Vector   | NT-Pulse                                                                                            | Fast.com                                                                                                          |
| :--------------------- | :-------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Execution Sandbox**  | **Native System Runtime** (Node.js/V8). Operates directly against the OS network stack.             | **Web Browser Sandbox**. Subject to DOM overhead and browser-enforced threading limits.                           |
| **Data Sourcing**      | **Uninitialized RAM Buffer**. Eliminates file-system I/O entirely. Constant steady-state streaming. | **Netflix OCA CDN**. Pulls cached chunks from edge storage appliances.                                            |
| **Memory Allocation**  | **Zero-Allocation Data Plane**. Drops incoming packets instantly. V8 GC is never triggered.         | **Browser Array Buffers**. Retains chunks temporarily, occasionally triggering browser Garbage Collection pauses. |
| **Security & Routing** | **HMAC-SHA256 Token Gates**. Real-time geometric proximity coordinate sorting.                      | **Anycast GeoDNS**. Relies on global DNS infrastructure to route to the closest datacenter.                       |

### **[READ THE ARCHITECTURE.md](./ARCHITECTURE.md)**

## Getting Started

Ensure you have a recent version of Node.js installed. The system utilizes `tsx` for rapid TypeScript execution.

### 1. Boot the Control Plane

Start the Orchestrator gateway to manage the mesh topology:

```bash
npm run orchestrator
```

### 2. Boot the Data Plane

Start the Secured Edge Node (automatically sends heartbeats to the Orchestrator):

```bash
npm run edge
```

### 3. Execute a Saturation Test

Run the client engine to query the network capacity:

```bash
npm run client
```
