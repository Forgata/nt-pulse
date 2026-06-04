import http from "http";
import crypto from "crypto";
import { WebSocketServer } from "ws";
import { verifyToken } from "./server/verifyToken.js";
import {
  registerWithOrchestrator,
  resolveDynamicNetworkProfile,
} from "./server/resolveNetworkTopology.js";

const PORT = parseInt(process.env.PORT || "4001");
const WS_PORT = parseInt(process.env.WS_PORT || "4002");
const CHUNK_SIZE = 64 * 1024;

let networkProfile = {
  id: `edge-node-${PORT}`,
  host: "",
  port: PORT,
  wsPort: PORT,
  latitude: 0,
  longitude: 0,
  isp: "Resolving...",
  city: "Resolving...",
};

console.log("[BOOT] Allocating 50MB uninitialized RAM buffer pool...");
const memoryBuffer = Buffer.allocUnsafe(50 * 1024 * 1024);

for (let i = 0; i < memoryBuffer.length; i++) {
  memoryBuffer[i] = Math.floor(Math.random() * 256);
}

const tcpServer = http.createServer((req, res) => {
  if (req.url === "/probe" && req.method === "HEAD") {
    res.writeHead(200);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});

function initializeWebSocketPlane(httpServer: http.Server) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || "";

    if (!verifyToken(token, networkProfile)) {
      console.warn(`[SECURITY] Rejected unauthorized WebSocket connection.`);
      ws.close(4401, "Unauthorized");
      return;
    }

    console.log(
      "[SESSION] Incoming WS connection authenticated. Saturating...",
    );

    let isSessionActive = true;
    let poolPointer = 0;

    ws.on("close", () => {
      isSessionActive = false;
      console.log("[SESSION] Socket closed cleanly.");
    });

    ws.on("error", () => {
      isSessionActive = false;
    });

    const blastData = () => {
      if (!isSessionActive) return;

      const chunk = memoryBuffer.subarray(
        poolPointer,
        poolPointer + CHUNK_SIZE,
      );
      poolPointer = (poolPointer + CHUNK_SIZE) % memoryBuffer.length;

      ws.send(chunk, { binary: true }, (err) => {
        if (!err && isSessionActive) {
          setImmediate(blastData);
        }
      });
    };

    blastData();
  });

  console.log(
    `[ENGINE] NT-Pulse WebSocket Data Plane active on WS port ${WS_PORT}`,
  );
}

tcpServer.listen(PORT, "0.0.0.0", async () => {
  console.log(`[ENGINE] NT-Pulse Control Plane listening on port ${PORT}`);
  await resolveDynamicNetworkProfile(networkProfile);
  await registerWithOrchestrator(networkProfile);
  initializeWebSocketPlane(tcpServer);

  setInterval(async () => {
    try {
      await resolveDynamicNetworkProfile(networkProfile);
      await registerWithOrchestrator(networkProfile);
    } catch (err: any) {
      console.error(
        `[HEARTBEAT] Failed to match orchestrator pulse:`,
        err.message,
      );
    }
  }, 15000);
});
