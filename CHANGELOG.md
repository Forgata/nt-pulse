# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This changelog starts from version 1.0.0.

## [2.2.0] - 2026-06-09

### Added

- **AI-Powered Diagnostics:** Integrated Google's ultra-low-latency `gemini-3.1-flash-lite` model via the REST API to deliver instant, single-sentence telemetry summaries for network performance.
- **Serverless Architecture:** Created a secure Node.js serverless function handler at `/api/speed-summary.js` to decouple AI generation logic from the client-side presentation layer.
- **Centered Loading UX:** Designed a pure CSS 3-dot pulse animation (`.ai-loader`) utilizing horizontal `box-shadow` shifting and automated margin calculations (`margin: 2rem auto`) for perfect symmetry on the dark-mode panel grid layer.

### Changed

- **Client Routing:** Updated frontend network pipelines to route traffic locally through relative endpoints (`/api/speed-summary?mbps=${finalMbps}`), completely abstracting target upstream URLs from the browser.
- **DOM Instantiation Strategy:** Refactored runtime element initialization from raw `insertAdjacentHTML` string parsing to clean, memory-allocated `document.createElement("p")` references. This guarantees zero async reference errors if multi-test overlapping occurs.
- **Style Isolation:** Separated the initial loading state (`.ai-loader`) from the text layout wrapper (`.ai-summary`) during element birth, eliminating visual padding collisions (`padding: 1rem`) while the background API promise resolves.

### Security

- **Credential Protection:** Migrated the `GEMINI_API_KEY` token entirely out of front-facing code asset directories into Vercel’s isolated runtime environment container (`process.env`). This entirely blocks public exposure and client-side credential sniffing.

## [2.1.4] - 2026-06-07

### Added

- **Dynamic Thread Throttling**: Rebuilt the Worker Thread pool constraint logic to actively prevent manually entered user inputs above `6` or below `1`.
- **Runtime Null Safety**: Fixed an unhandled telemetry engine crash when backspacing input values, cleanly bypassing execution failures caused by `NaN` states.
- **State Synchronization**: Automated global state synchronization to ensure runtime variables actively track preference changes instantly.

### Improved

- **Clinical Light Theme**: Implemented a responsive design token architecture (`data-theme="light"`) leveraging accessible, high-contrast palette variants optimized for bright environments.
- **Contextual Layout Variables**: Refactored static, hardcoded background colors into semantic properties to keep element layouts seamless across active UI workspace states.
- **Drop-Down Geometry Alignment**: Relocated the Preferences UI inside the configurations header wrapper, ensuring pixel-perfect top-right alignment underneath the settings icon on all viewports.
- **Anti-Flash Color Interpolation**: Applied unified CSS component transitions across all structural nodes to prevent raw layout flashes during live theme switching.

### Fixed

- **Event Propagation Patch**: Mitigated a structural event-bubbling glitch that forced the preferences overlay modal to instantly close when clicking internal configuration options.
- **Adaptive Toggle Icons**: Resolved a visual state-sync bug where the theme toggle icon failed to refresh its internal glyph state when clicking the configuration buttons.
- **Input Blur Recovery**: Integrated field validation triggers to gracefully roll back baseline functional defaults if user inputs are abandoned blank.

## [2.1.3] - 2026-06-07

### Added

- Styling for test status display.
- `size` attribute to the `<link rel="icon">` for better compatibility.

### Fixed

- Canonical link to point to main site [nt-pulse](https://nt-pulse.vercel.app/).
- Test execution workflow and UI feedback during telemetry tests.

## [2.1.2] - 2026-06-05

### Added

- **Telemetry Execution**: Added telemetry execution in the UI on `DOMContentLoaded` event for seamless testing.

### Improved

- **JavaScript load time**: Reduced the load time by using the `<script>` tag's `defer` to load the main.js and optimise `DOMContentLoaded`.

### Fixed

- **Dynamic Versioning**: Fixed versioning update in the Client UI since `/public` doesn't serve files outside its directory.

## [2.1.1] - 2026-06-05

### Added

- **SEO Optimization:** Enhanced the UI's search engine optimization (SEO) to improve visibility in search engines.
- **Icons**: add site favicon
- **Dynamic Version**

### Fixed

- UI responsiveness:

## [2.1.0] - 2026-06-05

### Added

- **Production-Ready Client Deployment Pipeline:** Integrated support for static site hosting (Vercel) for the UI layer, enabling global edge delivery of the dashboard.
- **Defensive Handshake Parsing:** Implemented robust response validation in `main.js` to handle non-200 status codes (like 503 Service Unavailable) gracefully. Added safety checks to token splitting routines to prevent runtime crashes during orchestration failure.
- **Automatic Heartbeat Re-registration:** Updated the Edge Node heartbeat loop to include an explicit `registerWithOrchestrator` call every 15 seconds. This ensures continuous TTL reset on the Orchestrator, preventing node pruning and maintaining active routing availability.

### Fixed

- **Handshake-to-Socket Race Condition:** Resolved a critical UI crash where the `main.js` client attempted to access `.split()` on an undefined token when the Orchestrator returned an empty or error-state discovery response.
- **WebSocket Secure Protocol Hardening:** Updated client-side connection logic to enforce secure WebSocket protocols (`wss://`) in alignment with modern browser security policies required for HTTPS-hosted client UIs.
- **Orchestrator Registration Payload Integrity:** Fixed a registration bug where the `wsEndpoint` was missing from the edge node's registration payload, causing validation rejections and subsequent "Service Unavailable" errors at the discovery stage.

### Changed

- **UI/Backend CORS Optimization:** Configured `Access-Control-Allow-Origin` headers on the Orchestrator to support cross-origin requests specifically from deployed UI environments, ensuring seamless communication between the Vercel-hosted frontend and the Render-hosted backend.

## [2.0.0] - 2026-06-04

### Added

- **Multi-Threaded Worker Pool Infrastructure:** Implemented a highly concurrent client architecture utilizing a background pool of 6 parallel Web Workers (`worker.js`). Network data-plane ingestion is completely offloaded to these independent execution contexts, successfully isolating raw network I/O from the browser's single-threaded UI loop and preventing V8 runtime engine freezes or rendering lag during peak saturation.
- **Clinical Browser UI Dashboard:** Designed and shipped a web-based presentation layer (`index.html` and `main.js`) to replace the legacy CLI engine. Features an instantaneous speed read-out, reactive state-machine indicators (`DISCOVERING`, `CONNECTING`, `WARMUP`, `ACTIVE`, `COMPLETE`), and a high-density, utility-driven diagnostic overlay displaying active worker matrices, localized ISP identity, and geometric coordinates.
- **Active Heartbeat TTL Pruning Engine:** Engineered a production-grade fault-tolerance loop inside the Orchestrator Control Plane. The gateway now evaluates an active memory map of edge instances, tracking 15-second heartbeat cycles fired from the nodes. Introduced an automated 30-second Time-To-Live (TTL) boundary check that runs every 10 seconds, immediately pruning unresponsive edge nodes to guarantee zero-fault routing allocation.
- **Out-of-Band Telemetry & Metrics API:** Added asynchronous telemetry ingestion endpoints (`POST /telemetry` and `GET /metrics`) to the Orchestrator tier. The UI client ships localized metrics upon completing a speed test cycle. This permits centralized historical logging and active infrastructure capacity planning without introducing thread-blocking network calls during sampling windows.

### Changed

- **Architectural Protocol Pivot (WebSockets over WebTransport):** Executed a vital systems pivot, shifting the core streaming data plane from WebTransport (HTTP/3 over QUIC) to high-throughput, raw binary WebSockets (`ws://`). This choice guarantees maximum deployment compatibility and library stability while cleanly preserving the system's low-overhead streaming objectives by blasting unformatted chunks straight down the TCP pipe.
- **Throughput Metrics Standardization:** Refactored the core performance evaluation formulas to standardize output metrics explicitly to Megabits per second (Mbps), matching industry networking conventions. The telemetry calculation engine executes a bit conversion multiplier (`bytes * 8`) combined with binary Mebibit division scaling (`/ (1024 * 1024)`) over precise window frames to report accurate wire throughput capacity.
- **Edge Architecture Separation:** Segregated the edge server runtime layout into a dual-plane architecture. Port 4001 handles standard incoming HTTP ingress, orchestration routing, and node tracking handshakes, while port 4002 isolates high-performance WebSocket data-plane streams, preventing transport line serialization interference.

### Fixed

- **UI Geometric Vector Mapping Malfunction:** Resolved a critical telemetry data mapping bug in `main.js` where the UI diagnostic card displayed the client-to-node Haversine distance (`distanceKm`) inside the `latitude` string slot alongside a hardcoded longitude placeholder of `0.0000`. Updated the Orchestrator's `POST /discover` mapping payload to explicitly pass `node.latitude` and `node.longitude` matrices down to the frontend handshake parser.

---

## [1.1.0] - 2026-06-02

### Added

- **Automated Client Topology Reflection:** Integrated an out-of-band JSON gateway reflection phase (`ip-api.com`) at client boot. The client now dynamically resolves its public IP metadata—extracting active ISP identification and precise geographic vectors (`latitude`, `longitude`)—completely eliminating hardcoded location coordinates.
- **Dynamic Proximity Routing Engine:** Refactored the Orchestrator’s `/discover` endpoint to ingest dynamic client coordinates. It now ranks and sorts the live `activeNodes` map using a real-time Haversine distance matrix, dynamically allocating the absolute closest edge server for the data plane pipeline.

### Fixed

- **HMAC Matrix Initialization Guard:** Resolved a critical runtime vulnerability where an uninitialized `ORCHESTRATOR_SECRET` environment variable caused `crypto.createHmac` to throw a silent `TypeError` inside the `/discover` telemetry pipeline. Implemented an explicit local development fallback string to ensure continuous operation during environment misconfigurations.

### Changed

- **Codebase Modularization:** Migrated all client utility calculation modules and geometry routines into an isolated folder structure to optimize code separation and maintenance boundaries.
