import http from "http";
import { URL } from "url";
import { discoverClientTopology } from "./client/discoverClientTopology.js";
import { fetchOptimalRouteToken } from "./client/fetchOptimalRouteToken.js";

const CONCURRENT_SOCKETS = 6;
const WARMUP_MS = 2000;
const SAMPLING_MS = 5000;

let clientProfile = {
  latitude: -15.7861,
  longitude: 35.0058,
  isp: "Unknown ISP",
};
let totalBytesTracked = 0;
let activePhase: "WARMUP" | "SAMPLING" | "DONE" = "WARMUP";

function runCalibration(
  endpoint: string,
): Promise<{ pingMs: number; jitterMs: number }> {
  return new Promise((resolve) => {
    console.log(
      "[CALIBRATION] Executing network vector baseline handshakes...",
    );
    const samples: number[] = [];
    const targetUrl = new URL(endpoint);

    const executeProbe = (index: number) => {
      if (index >= 5) {
        const pingMs = samples.reduce((a, b) => a + b, 0) / samples.length;
        let jitterSum = 0;
        for (let i = 1; i < samples.length; i++) {
          jitterSum += Math.abs(samples[i]! - samples[i - 1]!);
        }
        const jitterMs = jitterSum / (samples.length - 1);
        resolve({ pingMs, jitterMs });
        return;
      }

      const start = performance.now();
      const req = http.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port,
          path: "/probe",
          method: "HEAD",
        },
        (res) => {
          samples.push(performance.now() - start);
          res.destroy();
          setTimeout(() => executeProbe(index + 1), 100);
        },
      );
      req.on("error", () => {
        samples.push(performance.now() - start);
        setTimeout(() => executeProbe(index + 1), 100);
      });
      req.end();
    };

    executeProbe(0);
  });
}

function runThroughputTest(endpoint: string, token: string): Promise<number> {
  return new Promise((resolve) => {
    console.log(
      `[SATURATION] Spinning concurrent allocation pipeline (${CONCURRENT_SOCKETS} parallel sockets)...`,
    );
    const targetUrl = new URL(endpoint);
    const connections: http.ClientRequest[] = [];

    let samplingStartTime = 0;

    const spawnSocket = () => {
      const req = http.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port,
          path: "/data",
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          res.on("data", (chunk: Buffer) => {
            if (activePhase === "SAMPLING") {
              totalBytesTracked += chunk.length;
            }
          });
          res.on("end", () => {
            if (activePhase !== "DONE") spawnSocket();
          });
        },
      );

      req.on("error", () => {
        if (activePhase !== "DONE") setTimeout(spawnSocket, 50);
      });
      req.end();
      connections.push(req);
    };

    for (let i = 0; i < CONCURRENT_SOCKETS; i++) spawnSocket();

    console.log(
      `[SATURATION] Phase: TCP Warmup triggered for ${WARMUP_MS}ms...`,
    );

    setTimeout(() => {
      activePhase = "SAMPLING";
      totalBytesTracked = 0;
      samplingStartTime = performance.now();
      console.log(
        `[SATURATION] Phase: Pipe open! Recording real-time packets for ${SAMPLING_MS}ms...`,
      );

      const tracer = setInterval(() => {
        if (activePhase !== "SAMPLING") {
          clearInterval(tracer);
          return;
        }
        const currentElapsed = (performance.now() - samplingStartTime) / 1000;
        const interimMbps = (totalBytesTracked * 8) / currentElapsed / 1000000;
        console.log(`  -> Current Rate: ${interimMbps.toFixed(2)} Mbps`);
      }, 500);

      setTimeout(() => {
        activePhase = "DONE";
        const totalDurationSeconds =
          (performance.now() - samplingStartTime) / 1000;

        connections.forEach((conn) => conn.destroy());

        const finalMbps =
          (totalBytesTracked * 8) / totalDurationSeconds / 1000000;
        resolve(finalMbps);
      }, SAMPLING_MS);
    }, WARMUP_MS);
  });
}

function shipTelemetry(
  nodeId: string,
  pingMs: number,
  jitterMs: number,
  throughputMbps: number,
) {
  const payload = JSON.stringify({
    nodeId: nodeId,
    metrics: {
      pingMs: parseFloat(pingMs.toFixed(2)),
      jitterMs: parseFloat(jitterMs.toFixed(2)),
      throughputMbps: parseFloat(throughputMbps.toFixed(2)),
    },
    connection: {
      socketsUsed: CONCURRENT_SOCKETS,
      bytesTransferred: totalBytesTracked,
    },
  });

  const req = http.request({
    hostname: "localhost",
    port: 4000,
    path: "/telemetry",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  });

  req.on("error", () =>
    console.error("[TELEMETRY] Out-of-band telemetry shipping failed."),
  );
  req.write(payload);
  req.end();
}

async function pipeline() {
  try {
    await discoverClientTopology(clientProfile);
    const route = await fetchOptimalRouteToken(clientProfile);

    console.log(
      `[ROUTING] Allocated Target: ${route.targetId} (Distance: ${route.distanceKm} km)`,
    );

    const calibration = await runCalibration(route.endpoint);
    console.log(
      `[METRICS] Baseline Stable: Ping: ${calibration.pingMs.toFixed(2)}ms | Jitter: ${calibration.jitterMs.toFixed(2)}ms`,
    );

    const speed = await runThroughputTest(route.endpoint, route.token);
    console.log(
      `\n[COMPLETE] Final Evaluated Network Capacity: ${speed.toFixed(2)} Mbps`,
    );

    shipTelemetry(
      route.targetId,
      calibration.pingMs,
      calibration.jitterMs,
      speed,
    );
    console.log(
      "[TELEMETRY] Payload offloaded successfully to central metrics storage.\n",
    );
  } catch (err: any) {
    console.error(
      `\n[CRITICAL RUNTIME ERROR] Pipeline aborted: ${err.message}\n`,
    );
  }
}

pipeline();
