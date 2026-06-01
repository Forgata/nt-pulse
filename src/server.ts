import http from "http";
import crypto from "crypto";

const PORT = process.env.EDGE_PORT || 4001;
const ORCHESTRATOR_SECRET = "nt-pulse-quantum-secret-key"; // Shared symmetric key

console.log(`[BOOT] Allocating 50MB uninitialized RAM buffer pool...`);
const staticEntropyPool = Buffer.allocUnsafe(50 * 1024 * 1024);
crypto.randomFillSync(staticEntropyPool);

function verifyTokenSignature(token: string | undefined): boolean {
  if (!token) return false;

  try {
    const [base64Payload, signature] = token.split(".");
    if (!base64Payload || !signature) return false;

    const decodedPayload = Buffer.from(base64Payload, "base64").toString(
      "utf8",
    );
    const expectedSignature = crypto
      .createHmac("sha256", ORCHESTRATOR_SECRET)
      .update(decodedPayload)
      .digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length) return false;

    const isSignatureValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    if (!isSignatureValid) return false;

    const payload = JSON.parse(decodedPayload);
    if (Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (url?.startsWith("/download")) {
    const incomingToken = req.headers["x-pulse-token"] as string;

    if (!verifyTokenSignature(incomingToken)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden: Invalid or Expired Token");
      return;
    }

    if (method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end();
      return;
    }

    if (method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      });

      const streamPayload = () => {
        if (res.writableEnded) return;
        const canContinue = res.write(staticEntropyPool);
        if (canContinue) {
          setImmediate(streamPayload);
        } else {
          res.once("drain", streamPayload);
        }
      };

      streamPayload();
      return;
    }
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(
    `[ENGINE] NT-Pulse Secured Edge Target listening on port ${PORT}`,
  );
});

// Autonomous Heartbeat
// Autonomous Heartbeat
const registerWithGateway = () => {
  const payload = JSON.stringify({
    id: "edge-blantyre",
    host: "localhost",
    port: PORT,
    latitude: -15.7861,
    longitude: 35.0058,
  });

  const req = http.request({
    hostname: "localhost",
    port: 4000,
    path: "/register",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  });

  // CRITICAL: Handle offline orchestrator gracefully to prevent process crash
  req.on("error", (err) => {
    console.warn(
      `[HEARTBEAT] Gateway offline (ECONNREFUSED). Retrying on next cycle...`,
    );
  });

  req.write(payload);
  req.end();
};
setTimeout(registerWithGateway, 1000);
setInterval(registerWithGateway, 15000);
