// import http from "node:http";
// import crypto from "node:crypto";
// import "dotenv/config";

// const ORCHESTRATION_SECRET = process.env.ORCHESTRATION_SECRET;

// interface EdgeNode {
//   id: string;
//   host: string;
//   port: number;
//   latitude: number;
//   longitude: number;
//   lastHeartbeat: number;
// }

// const edgeRegistry: Map<string, EdgeNode> = new Map();

// edgeRegistry.set("edge-blantyre", {
//   id: "edge-blantyre",
//   host: "localhost",
//   port: 3000,
//   latitude: -15.7861,
//   longitude: 35.0058,
//   lastHeartbeat: Date.now(),
// });

// edgeRegistry.set("edge-lilongwe", {
//   id: "edge-lilongwe",
//   host: "192.168.1.50",
//   port: 3000,
//   latitude: -13.9626,
//   longitude: 33.7741,
//   lastHeartbeat: Date.now(),
// });

// edgeRegistry.set("edge-london", {
//   id: "edge-london",
//   host: "edge.uk.ntpulse.net",
//   port: 80,
//   latitude: 51.5074,
//   longitude: -0.1278,
//   lastHeartbeat: Date.now(),
// });

// function calculateHaversineDistance(
//   lat1: number,
//   long1: number,
//   lat2: number,
//   long2: number,
// ): number {
//   const earthRadiusKm = 6371;
//   const dLat = ((lat2 - lat1) * Math.PI) / 180;
//   const dLong = ((long2 - long1) * Math.PI) / 180;

//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos((lat1 * Math.PI) / 180) *
//       Math.cos((lat2 * Math.PI) / 180) *
//       Math.sin(dLong / 2) *
//       Math.sin(dLong / 2);

//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//   return earthRadiusKm * c;
// }

// function generateSignedToken(payload: object): string {
//   const stringifiedPayload = JSON.stringify(payload);
//   const signature = crypto
//     .createHmac("sha256", ORCHESTRATION_SECRET!)
//     .update(stringifiedPayload)
//     .digest("hex");

//   return `${Buffer.from(stringifiedPayload).toString("base64")}.${signature}`;
// }

// const PORT = process.env.ORCHESTRATION_PORT || 4000;

// const orchestrator = http.createServer((req, res) => {
//   const { method, url } = req;

//   res.setHeader("Access-Control-Allow-Origin", "*");
//   res.setHeader("Access-Control-Allow-Methods", "GET, POST");
//   res.setHeader("Access-Control-Allow-Headers", "*");

//   if (method === "OPTIONS") {
//     res.writeHead(204);
//     res.end();
//     return;
//   }

//   // ==========================================
//   if (method === "POST" && url === "/register") {
//     let body = "";
//     req.on("data", (chunk) => (body += chunk));
//     req.on("end", () => {
//       try {
//         const nodeData: Omit<EdgeNode, "lastHeartbeat"> = JSON.parse(body);

//         edgeRegistry.set(nodeData.id, {
//           ...nodeData,
//           lastHeartbeat: Date.now(),
//         });

//         console.log(
//           `[HEARTBEAT] Node "${nodeData.id}" successfully registered.`,
//         );
//         res.writeHead(200, { "Content-Type": "application/json" });
//         res.end(JSON.stringify({ status: "registered" }));
//       } catch (err) {
//         res.writeHead(400);
//         res.end("Invalid Payload");
//       }
//     });
//     return;
//   }

//   if (method === "POST" && url === "/discover") {
//     let body = "";
//     req.on("data", (chunk) => (body += chunk));
//     req.on("end", () => {
//       try {
//         const clientCoords: { latitude: number; longitude: number } =
//           JSON.parse(body);

//         console.log(
//           `[DISCOVERY] Request from Lat: ${clientCoords.latitude}, Lon: ${clientCoords.longitude}`,
//         );

//         const healthyThreshold = Date.now() - 30000;
//         const sortedNodes: Array<{ node: EdgeNode; distanceKm: number }> = [];

//         for (const node of edgeRegistry.values()) {
//           if (node.lastHeartbeat >= healthyThreshold) {
//             const distance = calculateHaversineDistance(
//               clientCoords.latitude,
//               clientCoords.longitude,
//               node.latitude,
//               node.longitude,
//             );
//             sortedNodes.push({ node, distanceKm: distance });
//           }
//         }

//         sortedNodes.sort((a, b) => a.distanceKm - b.distanceKm);

//         const optimalTargets = sortedNodes.slice(0, 3).map((item) => ({
//           id: item.node.id,
//           endpoint: `http://${item.node.host}:${item.node.port}`,
//           distanceKm: parseFloat(item.distanceKm.toFixed(2)),
//         }));

//         const tokenPayload = {
//           targets: optimalTargets,
//           exp: Date.now() + 600000,
//         };
//         const token = generateSignedToken(tokenPayload);

//         res.writeHead(200, { "Content-Type": "application/json" });
//         res.end(
//           JSON.stringify({
//             clientLocation: clientCoords,
//             token: token,
//             suggestedNodes: optimalTargets,
//           }),
//         );
//       } catch (err) {
//         res.writeHead(400);
//         res.end("Invalid Discovery Payload");
//       }
//     });
//     return;
//   }

//   res.writeHead(404);
//   res.end("Not Found");

//   if (method === "POST" && url === "/telemetry") {
//     let body = "";
//     req.on("data", (chunk) => (body += chunk));
//     req.on("end", () => {
//       try {
//         const telemetryPayload = JSON.parse(body);

//         res.writeHead(202, { "Content-Type": "application/json" });
//         res.end(JSON.stringify({ status: "accepted" }));

//         setImmediate(() => {
//           const structuredLog = {
//             timestamp: new Date().toISOString(),
//             nodeId: telemetryPayload.nodeId,
//             metrics: {
//               pingMs: parseFloat(telemetryPayload.pingMs.toFixed(2)),
//               jitterMs: parseFloat(telemetryPayload.jitterMs.toFixed(2)),
//               throughputMbps: parseFloat(
//                 telemetryPayload.throughputMbps.toFixed(2),
//               ),
//             },
//             connection: {
//               socketsUsed: telemetryPayload.socketsUsed,
//               bytesTransferred: telemetryPayload.bytesTransferred,
//             },
//           };

//           console.log(`\n[ANALYTICS INGEST] Telemetry Logged Sucessfully:`);
//           console.dir(structuredLog, { depth: null, colors: true });
//         });
//       } catch (err) {
//         res.writeHead(400);
//         res.end("Malformed Telemetry Data");
//       }
//     });
//     return;
//   }
// });

// orchestrator.listen(PORT, () => {
//   console.log(
//     `[ORCHESTRATOR] NT-Pulse Tier 2 Gateway operational on port ${PORT}`,
//   );
// });

import http from "http";
import crypto from "crypto";

const ORCHESTRATOR_SECRET = "nt-pulse-quantum-secret-key";

interface EdgeNode {
  id: string;
  host: string;
  port: number;
  latitude: number;
  longitude: number;
  lastHeartbeat: number;
}

const edgeRegistry = new Map<string, EdgeNode>();

edgeRegistry.set("edge-blantyre", {
  id: "edge-blantyre",
  host: "localhost",
  port: 4001,
  latitude: -15.7861,
  longitude: 35.0058,
  lastHeartbeat: Date.now(),
});

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function generateSignedToken(payload: object): string {
  const stringifiedPayload = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", ORCHESTRATOR_SECRET)
    .update(stringifiedPayload)
    .digest("hex");
  return `${Buffer.from(stringifiedPayload).toString("base64")}.${signature}`;
}

const PORT = process.env.ORCHESTRATOR_PORT || 4000;

const orchestrator = http.createServer((req, res) => {
  const { method, url } = req;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "POST" && url === "/register") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const nodeData: Omit<EdgeNode, "lastHeartbeat"> = JSON.parse(body);
        edgeRegistry.set(nodeData.id, {
          ...nodeData,
          lastHeartbeat: Date.now(),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "registered" }));
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400);
          res.end("Invalid Payload");
        }
      }
    });
    return;
  }

  if (method === "POST" && url === "/discover") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const clientCoords: { latitude: number; longitude: number } =
          JSON.parse(body);
        console.log(
          `[DISCOVERY] Request from Lat: ${clientCoords.latitude}, Lon: ${clientCoords.longitude}`,
        );

        const healthyThreshold = Date.now() - 30000;
        const sortedNodes: Array<{ node: EdgeNode; distanceKm: number }> = [];

        for (const node of edgeRegistry.values()) {
          if (node.lastHeartbeat >= healthyThreshold) {
            const distance = calculateHaversineDistance(
              clientCoords.latitude,
              clientCoords.longitude,
              node.latitude,
              node.longitude,
            );
            sortedNodes.push({ node, distanceKm: distance });
          }
        }

        sortedNodes.sort((a, b) => a.distanceKm - b.distanceKm);

        const optimalTargets = sortedNodes.slice(0, 3).map((item) => ({
          id: item.node.id,
          endpoint: `http://${item.node.host}:${item.node.port}`,
          distanceKm: parseFloat(item.distanceKm.toFixed(2)),
        }));

        const tokenPayload = {
          targets: optimalTargets,
          exp: Date.now() + 600000,
        };
        const token = generateSignedToken(tokenPayload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            clientLocation: clientCoords,
            token: token,
            suggestedNodes: optimalTargets,
          }),
        );
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400);
          res.end("Invalid Discovery Payload");
        }
      }
    });
    return;
  }

  if (method === "POST" && url === "/telemetry") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const telemetryPayload = JSON.parse(body);

        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));

        setImmediate(() => {
          const structuredLog = {
            timestamp: new Date().toISOString(),
            nodeId: telemetryPayload.nodeId || "unknown-node",
            metrics: {
              pingMs: parseFloat((telemetryPayload.pingMs || 0).toFixed(2)),
              jitterMs: parseFloat((telemetryPayload.jitterMs || 0).toFixed(2)),
              throughputMbps: parseFloat(
                (telemetryPayload.throughputMbps || 0).toFixed(2),
              ),
            },
            connection: {
              socketsUsed: telemetryPayload.socketsUsed || 0,
              bytesTransferred: telemetryPayload.bytesTransferred || 0,
            },
          };

          console.log(`\n[ANALYTICS INGEST] Telemetry Logged Successfully:`);
          console.dir(structuredLog, { depth: null, colors: true });
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(400);
          res.end("Malformed Telemetry Data");
        }
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

orchestrator.listen(PORT, () => {
  console.log(
    `[ORCHESTRATOR] NT-Pulse Tier 2 Gateway operational on port ${PORT}`,
  );
});
