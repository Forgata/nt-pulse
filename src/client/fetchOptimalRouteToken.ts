import http from "node:http";
import type { clientProfile } from "./types.js";

export function fetchOptimalRouteToken(clientProfile: clientProfile): Promise<{
  token: string;
  endpoint: string;
  targetId: string;
  distanceKm: number;
}> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      latitude: clientProfile.latitude,
      longitude: clientProfile.longitude,
    });

    const req = http.request(
      {
        hostname: "localhost",
        port: 4000,
        path: "/discover",
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
            reject(
              new Error(
                `Orchestrator rejected allocation: Status ${res.statusCode} (${body.trim()})`,
              ),
            );
            return;
          }
          const data = JSON.parse(body);
          const optimalNode = data.suggestedNodes[0];
          resolve({
            token: data.token,
            endpoint: optimalNode.endpoint,
            targetId: optimalNode.id,
            distanceKm: optimalNode.distanceKm,
          });
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}
