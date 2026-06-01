import http from "node:http";
import { performance } from "node:perf_hooks";

enum EngineState {
  IDLE = "IDLE",
  LATENCY_CHECK = "LATENCY_CHECK",
  RUNNING = "RUNNING",
  TCP_WARMUP = "TCP_WARMUP",
  SAMPLING = "SAMPLING",
  FINALIZING = "FINALIZING",
}
const TARGET_HOST = "localhost";
const TARGET_PORT = 4001;
const CONCURRENT_CONNECTIONS = 6;
const WARMUP_DURATION_MS = 2000;
const SAMPLING_DURATION_MS = 5000;

class NTPulseClient {
  private state: EngineState = EngineState.IDLE;
  private totalBytesTracked: number = 0;
  private activeRequests: http.ClientRequest[] = [];
  private samplingStartTime: number = 0;
  private intervalId: NodeJS.Timeout | null = null;

  private changeState(newState: EngineState) {
    this.state = newState;
    console.log(`State changed to: ${this.state}`);
  }

  async runLatencyCheck(
    sampleCount: number = 0,
  ): Promise<{ ping: number; jitter: number }> {
    this.changeState(EngineState.LATENCY_CHECK);
    const latencies: number[] = [];
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      method: "HEAD",
      agent: false,
      path: "/download",
    };

    for (let i = 0; i < sampleCount; i++) {
      await new Promise<void>((resolve) => {
        const startTime = performance.now();
        const req = http.request(options, (res) => {
          const endTime = performance.now();
          latencies.push(endTime - startTime);
          res.resume();
        });
        req.on("error", () => resolve());
        req.end();
      });
    }

    const avgPing =
      latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;

    let totalDifference = 0;

    for (let i = 0; i < latencies.length; i++) {
      totalDifference += Math.abs(latencies[i]! - latencies[i - 1]!);
    }

    const jitter = totalDifference / (latencies.length - 1) || 0;
    console.log(
      `[METRICS] Baseline Ping: ${avgPing.toFixed(2)} ms, Jitter: ${jitter.toFixed(2)} ms`,
    );
    return { ping: avgPing, jitter };
  }
}
