import http from "http";
import { performance } from "perf_hooks";
import { URL } from "url";

const ORCHESTRATOR_URL = "http://localhost:4000/discover";
const CLIENT_LAT = -15.7861;
const CLIENT_LON = 35.0058;

const CONCURRENT_SOCKETS = 6;
const WARMUP_DURATION_MS = 2000;
const SAMPLING_DURATION_MS = 5000;

class NTPulseClient {
  private totalBytesTracked = 0;
  private activeRequests: http.ClientRequest[] = [];
  private samplingStartTime = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isSamplingActive = false;

  private targetHost = "";
  private targetPort = 0;
  private token = "";

  async discoverOptimalNode(): Promise<string> {
    console.log(`[DISCOVERY] Querying Orchestrator Gateway...`);
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
            if (res.statusCode !== 200)
              return reject(new Error("Discovery failed"));
            const data = JSON.parse(body);

            this.token = data.token;
            resolve(data.suggestedNodes[0].endpoint);
          });
        },
      );
      req.write(payload);
      req.end();
    });
  }

  async runLatencyCheck(): Promise<{ ping: number; jitter: number }> {
    console.log(`[LATENCY] Assessing round-trip vectors...`);
    const latencies: number[] = [];

    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => {
        const start = performance.now();
        const req = http.request(
          {
            hostname: this.targetHost,
            port: this.targetPort,
            path: `/download?t=${Date.now()}`,
            method: "HEAD",
            agent: false,
            headers: { "X-Pulse-Token": this.token },
          },
          (res) => {
            latencies.push(performance.now() - start);
            res.resume();
            resolve();
          },
        );
        req.on("error", () => resolve());
        req.end();
      });
    }

    const ping = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    let diffs = 0;
    for (let i = 1; i < latencies.length; i++)
      diffs += Math.abs(latencies[i]! - latencies[i - 1]!);
    const jitter = diffs / (latencies.length - 1);

    return { ping, jitter };
  }

  public async run() {
    try {
      const endpoint = await this.discoverOptimalNode();
      const urlTokens = new URL(endpoint);
      this.targetHost = urlTokens.hostname;
      this.targetPort = parseInt(urlTokens.port || "80");

      const metrics = await this.runLatencyCheck();
      console.log(
        `[LATENCY] Baseline Complete -> Ping: ${metrics.ping.toFixed(2)}ms | Jitter: ${metrics.jitter.toFixed(2)}ms`,
      );

      console.log(
        `[WARMUP] Priming TCP transport pipes (Slowing Slow-Start)...`,
      );

      for (let i = 0; i < CONCURRENT_SOCKETS; i++) {
        const options: http.RequestOptions = {
          hostname: this.targetHost,
          port: this.targetPort,
          path: "/download",
          method: "GET",
          agent: false,
          headers: { "X-Pulse-Token": this.token },
        };

        const req = http.get(options, (res) => {
          if (res.statusCode === 403) {
            console.error(
              `[CRITICAL] Edge Node rejected connection with 403 Forbidden.`,
            );
            process.exit(1);
          }
          res.on("data", (chunk: Buffer) => {
            if (this.isSamplingActive) {
              this.totalBytesTracked += chunk.length;
            }
          });
        });
        this.activeRequests.push(req);
      }

      setTimeout(() => {
        console.log(`[STATE] ➔ SAMPLING WINDOW OPENED`);
        this.totalBytesTracked = 0;
        this.samplingStartTime = performance.now();
        this.isSamplingActive = true;

        this.intervalId = setInterval(() => {
          const elapsed = (performance.now() - this.samplingStartTime) / 1000;
          const mbps = (this.totalBytesTracked * 8) / (elapsed * 1000000);
          console.log(
            `[LIVE SPEEDS] Running... Throughput Capability: ${mbps.toFixed(2)} Mbps`,
          );
        }, 400);

        setTimeout(
          () => this.teardownAndFinalize(metrics.ping, metrics.jitter),
          SAMPLING_DURATION_MS,
        );
      }, WARMUP_DURATION_MS);
    } catch (err: any) {
      console.error(`[FAILURE] ${err.message}`);
    }
  }

  private teardownAndFinalize(ping: number, jitter: number) {
    this.isSamplingActive = false;
    if (this.intervalId) clearInterval(this.intervalId);

    const elapsedSeconds = (performance.now() - this.samplingStartTime) / 1000;
    const finalMbps = (this.totalBytesTracked * 8) / (elapsedSeconds * 1000000);

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
      pingMs: ping,
      jitterMs: jitter,
      throughputMbps: finalMbps,
      socketsUsed: CONCURRENT_SOCKETS,
      bytesTransferred: this.totalBytesTracked,
    });

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
    reportReq.write(telemetryPayload);
    reportReq.end();
  }
}

const engine = new NTPulseClient();
engine.run();
