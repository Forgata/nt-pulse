import http from "http";
import { performance } from "perf_hooks";
import { URL } from "url";

enum EngineState {
  IDLE = "IDLE",
  DISCOVERING = "DISCOVERING",
  LATENCY_CHECK = "LATENCY_CHECK",
  TCP_WARMUP = "TCP_WARMUP",
  SAMPLING = "SAMPLING",
  FINALIZING = "FINALIZING",
}

const ORCHESTRATOR_URL = "http://localhost:4000/discover";

const CLIENT_LAT = -15.7861;
const CLIENT_LON = 35.0058;

const CONCURRENT_SOCKETS = 6;
const WARMUP_DURATION_MS = 2000;
const SAMPLING_DURATION_MS = 5000;

class NTPulseIntegratedClient {
  private state: EngineState = EngineState.IDLE;
  private totalBytesTracked = 0;
  private activeRequests: http.ClientRequest[] = [];
  private samplingStartTime = 0;
  private intervalId: NodeJS.Timeout | null = null;

  private targetHost = "";
  private targetPort = 80;

  private changeState(newState: EngineState) {
    this.state = newState;
    console.log(`\n[STATE CHANGE] ➔ ${this.state}`);
  }

  async discoverOptimalNode(): Promise<string> {
    this.changeState(EngineState.DISCOVERING);
    console.log(
      `[GATEWAY] Querying topology matrix for closest edge targets...`,
    );

    const payload = JSON.stringify({
      latitude: CLIENT_LAT,
      longitude: CLIENT_LON,
    });
    const gatewayUrl = new URL(ORCHESTRATOR_URL);

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: gatewayUrl.hostname,
          port: gatewayUrl.port,
          path: gatewayUrl.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              return reject(
                new Error(`Discovery failed with status ${res.statusCode}`),
              );
            }

            const responseData = JSON.parse(body);
            if (
              !responseData.suggestedNodes ||
              responseData.suggestedNodes.length === 0
            ) {
              return reject(
                new Error(
                  "No active or healthy edge nodes available near your location.",
                ),
              );
            }

            const primaryNode = responseData.suggestedNodes[0];
            console.log(
              `[DISCOVERY SUCCESS] Selected Node: ${primaryNode.id} (${primaryNode.distanceKm} km away)`,
            );
            resolve(primaryNode.endpoint);
          });
        },
      );

      req.on("error", (err) => reject(err));
      req.write(payload);
      req.end();
    });
  }

  async runLatencyCheck(samplesCount = 5): Promise<void> {
    this.changeState(EngineState.LATENCY_CHECK);
    const latencies: number[] = [];

    const options: http.RequestOptions = {
      hostname: this.targetHost,
      port: this.targetPort,
      path: "/download",
      method: "HEAD",
      agent: false,
    };

    for (let i = 0; i < samplesCount; i++) {
      await new Promise<void>((resolve) => {
        const start = performance.now();
        const req = http.request(options, (res) => {
          const end = performance.now();
          latencies.push(end - start);
          res.resume();
          resolve();
        });
        req.on("error", () => resolve());
        req.end();
      });
    }

    const avgPing = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    let totalDifference = 0;
    for (let i = 1; i < latencies.length; i++) {
      totalDifference += Math.abs(latencies[i]! - latencies[i - 1]!);
    }
    const jitter = totalDifference / (latencies.length - 1);

    console.log(`[METRICS] Target Baseline Ping: ${avgPing.toFixed(2)}ms`);
    console.log(`[METRICS] Target Baseline Jitter: ${jitter.toFixed(2)}ms`);
  }

  public async run() {
    try {
      const endpoint = await this.discoverOptimalNode();
      const urlTokens = new URL(endpoint);

      this.targetHost = urlTokens.hostname;
      this.targetPort = parseInt(urlTokens.port || "80");

      await this.runLatencyCheck();

      this.changeState(EngineState.TCP_WARMUP);
      console.log(
        `[LAUNCH] Initializing link saturation across ${CONCURRENT_SOCKETS} independent sockets...`,
      );

      const options: http.RequestOptions = {
        hostname: this.targetHost,
        port: this.targetPort,
        path: "/download",
        method: "GET",
        agent: false,
      };

      for (let i = 0; i < CONCURRENT_SOCKETS; i++) {
        const req = http.get(options, (res) => {
          res.on("data", (chunk: Buffer) => {
            if (this.state === EngineState.SAMPLING) {
              this.totalBytesTracked += chunk.length;
            }
          });
        });

        req.on("error", (err) => {
          if (this.state !== EngineState.FINALIZING) {
            console.error(`[SOCKET ERROR] ${err.message}`);
          }
        });

        this.activeRequests.push(req);
      }

      setTimeout(() => {
        this.totalBytesTracked = 0;
        this.samplingStartTime = performance.now();
        this.changeState(EngineState.SAMPLING);

        this.intervalId = setInterval(() => this.emitLiveMetrics(), 200);

        setTimeout(() => this.teardownAndFinalize(), SAMPLING_DURATION_MS);
      }, WARMUP_DURATION_MS);
    } catch (error: any) {
      console.error(`\n[CRITICAL ENGINE FAILURE] ${error.message}`);
      this.state = EngineState.IDLE;
    }
  }

  private emitLiveMetrics() {
    const elapsedSeconds = (performance.now() - this.samplingStartTime) / 1000;
    if (elapsedSeconds <= 0) return;

    const mbps = (this.totalBytesTracked * 8) / (elapsedSeconds * 1000000);
    process.stdout.write(
      `\r[LIVE SPEEDS] Running... Throughput Capability: ${mbps.toFixed(2)} Mbps`,
    );
  }

  private teardownAndFinalize() {
    this.changeState(EngineState.FINALIZING);
    if (this.intervalId) clearInterval(this.intervalId);

    const elapsedSeconds = (performance.now() - this.samplingStartTime) / 1000;
    const finalMbps = (this.totalBytesTracked * 8) / (elapsedSeconds * 1000000);

    console.log(
      `\n[TEARDOWN] Dropping high-volume client streaming connections...`,
    );
    this.activeRequests.forEach((req) => req.destroy());
    this.activeRequests = [];

    console.log(`\n--- ENGINE COMPLETED SUCCESS ---`);
    console.log(
      `Target Routing Node:       ${this.targetHost}:${this.targetPort}`,
    );
    console.log(
      `Isolated Sampling Window:  ${elapsedSeconds.toFixed(4)} Seconds`,
    );
    console.log(
      `Total Bytes Transferred:   ${(this.totalBytesTracked / (1024 * 1024)).toFixed(2)} MB`,
    );
    console.log(`Final Link Saturation:     ${finalMbps.toFixed(2)} Mbps`);
    console.log(`--------------------------------\n`);

    const telemetryPayload = JSON.stringify({
      nodeId: "edge-blantyre",
      pingMs: 0.5, // Mocked from the latency check phase cache
      jitterMs: 0.1,
      throughputMbps: finalMbps,
      socketsUsed: CONCURRENT_SOCKETS,
      bytesTransferred: this.totalBytesTracked,
    });

    console.log(
      `[TELEMETRY] Shipping post-flight diagnostic records out-of-band...`,
    );
    const reportReq = http.request({
      hostname: "localhost",
      port: 4000,
      path: "/telemetry",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(telemetryPayload),
      },
    });

    reportReq.on("error", (e) =>
      console.log(`[TELEMETRY WARN] Failed to log telemetry: ${e.message}`),
    );
    reportReq.write(telemetryPayload);
    reportReq.end();
  }
}

const engine = new NTPulseIntegratedClient();
engine.run();
