import "dotenv/config";
import http from "http";
import crypto from "crypto";
import { calculateHaversineDistance } from "./haversineDIstance.js";

const PORT = 4000;
const ORCHESTRATION_SECRET =
  process.env.ORCHESTRATION_SECRET ||
  "dev-secret-baseline-token-32-chars-minimum";

if (!ORCHESTRATION_SECRET)
  throw new Error("ORCHESTRATION_SECRET environment variable is required.");

interface EdgeNode {
  id: string;
  host: string;
  port: number;
  latitude: number;
  longitude: number;
  isp: string;
  city: string;
  lastSeen: number;
}
const activeNodes = new Map<string, EdgeNode>();
const telemetryHistory: any[] = [];

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (url === "/register" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const nodeData = JSON.parse(body);

        if (
          !nodeData.id ||
          !nodeData.port ||
          nodeData.latitude == null ||
          nodeData.longitude == null
        ) {
          res.writeHead(400);
          res.end("Malformed node registration profile.");
          return;
        }

        activeNodes.set(nodeData.id, {
          id: nodeData.id,
          host: nodeData.host || "localhost",
          port: nodeData.port,
          latitude: nodeData.latitude,
          longitude: nodeData.longitude,
          isp: nodeData.isp || "Unknown ISP",
          city: nodeData.city || "Unknown Location",
          lastSeen: Date.now(),
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "acknowledged",
            poolSize: activeNodes.size,
          }),
        );
      } catch {
        res.writeHead(400);
        res.end("Invalid Payload Data JSON");
      }
    });
    return;
  }

  if (url === "/discover" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const clientLoc = JSON.parse(body);
        const cLat = clientLoc.latitude;
        const cLon = clientLoc.longitude;

        if (cLat == null || cLon == null) {
          res.writeHead(400);
          res.end("Client geographic vector inputs missing.");
          return;
        }

        if (activeNodes.size === 0) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "No edge deployment pools available online.",
            }),
          );
          return;
        }

        const rankedNodes = Array.from(activeNodes.values()).map((node) => {
          const distanceKm = calculateHaversineDistance(
            cLat,
            cLon,
            node.latitude,
            node.longitude,
          );
          return {
            id: node.id,
            endpoint: `http://${node.host}:${node.port}`,
            isp: node.isp,
            city: node.city,
            distanceKm: parseFloat(distanceKm.toFixed(2)),
          };
        });

        rankedNodes.sort((a, b) => a.distanceKm - b.distanceKm);
        const optimalNode = rankedNodes[0]!;

        const tokenPayload = JSON.stringify({
          iss: "nt-pulse-orchestrator",
          exp: Date.now() + 60000,
          targetNode: optimalNode.id,
        });
        const base64Payload = Buffer.from(tokenPayload).toString("base64");
        const signature = crypto
          .createHmac("sha256", ORCHESTRATION_SECRET)
          .update(tokenPayload)
          .digest("hex");
        const secureToken = `${base64Payload}.${signature}`;

        console.log(
          `[ROUTING] Client Localized. Nearest Target: ${optimalNode.id} (${optimalNode.distanceKm} km away) | ISP: ${optimalNode.isp}`,
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            token: secureToken,
            suggestedNodes: rankedNodes,
          }),
        );
      } catch {
        res.writeHead(400);
        res.end("Bad Client Initialization Matrix");
      }
    });
    return;
  }

  if (url === "/telemetry" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const telemetry = JSON.parse(body);
        telemetry.timestamp = new Date().toISOString();

        telemetryHistory.push(telemetry);
        if (telemetryHistory.length > 15) telemetryHistory.shift();

        console.log(
          `[ANALYTICS] Ingest complete for node: ${telemetry.nodeId} -> Throughput: ${telemetry.throughputMbps.toFixed(2)} Mbps`,
        );

        res.writeHead(202);
        res.end();
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  if (url === "/metrics" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        onlineNodesCount: activeNodes.size,
        history: telemetryHistory,
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

setInterval(() => {
  const TTL_BOUNDARY_MS = 30000;
  const now = Date.now();
  for (const [id, node] of activeNodes.entries()) {
    if (now - node.lastSeen > TTL_BOUNDARY_MS) {
      activeNodes.delete(id);
      console.warn(
        `[PRUNE] Edge connection dropped: '${id}' missed heartbeat TTL limit.`,
      );
    }
  }
}, 10000);

server.listen(PORT, () => {
  console.log(`[ORCHESTRATOR] Plane live on port ${PORT}`);
});
