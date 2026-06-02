import http from "node:http";

export function runCalibration(
  endpoint: string,
): Promise<{ pingMs: number; jitterMs: number }> {
  return new Promise((resolve) => {
    console.log("[CALIBRATION] Executing network vector handshakes...");
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
