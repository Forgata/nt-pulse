import "dotenv/config";
import http from "http";
import crypto from "crypto";
import { calculateHaversineDistance } from "./orchestrator/haversineDIstance.js";

const PORT = parseInt(process.env.PORT || "4000");
const ORCHESTRATION_SECRET =
  process.env.ORCHESTRATION_SECRET ||
  "dev-secret-baseline-token-32-chars-minimum";

if (!ORCHESTRATION_SECRET)
  throw new Error("ORCHESTRATION_SECRET environment variable is required.");

interface EdgeNode {
  id: string;
  host: string;
  port: number;
  wsPort: number;
  wsEndpoint: string;
  latitude: number;
  longitude: number;
  isp: string;
  city: string;
  lastSeen: number;
}

const activeNodes = new Map<string, EdgeNode>();
const telemetryHistory: any[] = [];

async function resolveClientIpGeo(
  ip: string,
): Promise<{ lat: number; lon: number; isp: string; city: string }> {
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.0.0.1")) {
    return {
      lat: -15.7861,
      lon: 35.0058,
      isp: "Local Loopback Driver",
      city: "Blantyre",
    };
  }
  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon,isp,city`,
    );
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.status === "success") {
      return {
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon),
        isp: data.isp,
        city: data.city,
      };
    }
  } catch {}
  // Default regional fallback parameter layout if external resolution fails
  return {
    lat: -15.7861,
    lon: 35.0058,
    isp: "Default Network ISP",
    city: "Blantyre",
  };
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  if (!url) return;

  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (pathname === "/register" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const nodeData = JSON.parse(body) as EdgeNode;

        if (
          !nodeData.id ||
          !nodeData.port ||
          !nodeData.wsPort ||
          !nodeData.wsEndpoint ||
          nodeData.latitude == null ||
          nodeData.longitude == null
        ) {
          res.writeHead(400);
          res.end("Malformed node registration profile.");
          return;
        }

        activeNodes.set(nodeData.id, {
          ...nodeData,
          lastSeen: Date.now(),
        });

        console.log(
          `[REGISTRY] Dynamic node updated: ${nodeData.id} | Location: ${nodeData.city} | ISP: ${nodeData.isp}`,
        );

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

  if (pathname === "/discover") {
    if (method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));

      req.on("end", async () => {
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

          const forwardedHeader = req.headers["x-forwarded-for"];
          const clientIp =
            typeof forwardedHeader === "string"
              ? forwardedHeader.split(",")[0]
              : req.socket.remoteAddress || "127.0.0.1";

          const clientResolvedData = await resolveClientIpGeo(clientIp!);

          const rankedNodes = Array.from(activeNodes.values()).map((node) => {
            const distanceKm = calculateHaversineDistance(
              cLat,
              cLon,
              node.latitude,
              node.longitude,
            );
            return {
              id: node.id,
              endpoint: node.wsEndpoint,
              isp: node.isp,
              city: node.city,
              distanceKm: parseFloat(distanceKm.toFixed(2)),
              latitude: node.latitude,
              longitude: node.longitude,
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
            `[ROUTING] CLI Client Localized. Nearest Target: ${optimalNode.id} (${optimalNode.distanceKm} km away) | ISP: ${optimalNode.isp}`,
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              token: secureToken,
              suggestedNodes: rankedNodes,
              clientIsp: clientResolvedData.isp,
            }),
          );
        } catch {
          res.writeHead(400);
          res.end("Bad Client Initialization Matrix");
        }
      });
      return;
    }

    if (method === "GET") {
      const clientId = parsedUrl.searchParams.get("clientId");
      if (!clientId) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request: Missing client identifier token.");
        return;
      }

      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      const resolvedGeo = await resolveClientIpGeo(clientIp);

      let targetNode: Omit<EdgeNode, "lastSeen">;

      if (activeNodes.size > 0) {
        const rankedNodes = Array.from(activeNodes.values()).map((node) => {
          const distanceKm = calculateHaversineDistance(
            resolvedGeo.lat,
            resolvedGeo.lon,
            node.latitude,
            node.longitude,
          );
          return { ...node, distanceKm };
        });

        rankedNodes.sort((a, b) => a.distanceKm - b.distanceKm);
        targetNode = rankedNodes[0]!;
      } else {
        targetNode = {
          id: `edge-node-4001`,
          host: "127.0.0.1",
          port: 4001,
          wsPort: 4002,
          wsEndpoint: `ws://${targetNode!.host}:${targetNode!.wsPort}`,
          latitude: -15.7861,
          longitude: 35.0058,
          isp: "Local Loopback Driver",
          city: "Blantyre",
        };
      }

      const tokenPayload = JSON.stringify({
        iss: "nt-pulse-orchestrator",
        exp: Date.now() + 60000,
        targetNode: targetNode.id,
      });
      const base64Payload = Buffer.from(tokenPayload).toString("base64");
      const signature = crypto
        .createHmac("sha256", ORCHESTRATION_SECRET)
        .update(tokenPayload)
        .digest("hex");
      const secureToken = `${base64Payload}.${signature}`;

      console.log(
        `[ROUTING] UI Handshake [${clientId}] matched with: ${targetNode.id} (${targetNode.isp})`,
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: targetNode.id,
          host: targetNode.host,
          wsEndpoint: targetNode.wsEndpoint,
          port: targetNode.port,
          wsPort: targetNode.wsPort,
          latitude: targetNode.latitude,
          longitude: targetNode.longitude,
          isp: targetNode.isp,
          token: secureToken,
        }),
      );
      return;
    }
  }

  if (pathname === "/telemetry" && method === "POST") {
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

  if (pathname === "/metrics" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
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
  const TTL_BOUNDARY_MS = 60000;
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ORCHESTRATOR] Plane live on port ${PORT}`);
});
