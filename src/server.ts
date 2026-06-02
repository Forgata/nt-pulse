import http from "http";
import crypto from "crypto";

const PORT = parseInt(process.env.EDGE_PORT || "4001");
const ORCHESTRATOR_SECRET = "nt-pulse-quantum-secret-key";

let networkProfile = {
  id: `edge-node-${PORT}`,
  host: "localhost",
  port: PORT,
  latitude: -15.7861,
  longitude: 35.0058,
  isp: "Local Loopback",
  city: "Blantyre",
};

function discoverNetworkTopology(): Promise<void> {
  return new Promise((resolve) => {
    console.log(
      "[BOOT] Querying public routing registries for network profile...",
    );

    http
      .get("http://ip-api.com/json/", (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data && data.status === "success") {
              const sanitizedCity = data.city
                .toLowerCase()
                .replace(/\s+/g, "-");
              networkProfile.id = `edge-${sanitizedCity}-${PORT}`;
              networkProfile.latitude = data.lat;
              networkProfile.longitude = data.lon;
              networkProfile.isp = data.isp;
              networkProfile.city = data.city;

              console.log(
                `[AUTODISCOVER] Network Resolved! City: ${data.city} | ISP: ${data.isp} | Vectors: [${data.lat}, ${data.lon}]`,
              );
            } else {
              console.warn(
                "[AUTODISCOVER] Registry frame failure. Deploying with baseline environment defaults.",
              );
            }
          } catch {
            console.warn(
              "[AUTODISCOVER] Failed to parse network registry response. Deploying with baseline defaults.",
            );
          }
          resolve();
        });
      })
      .on("error", () => {
        console.warn(
          "[AUTODISCOVER] Public internet unreachable. Operating in local-only loopback mode.",
        );
        resolve();
      });
  });
}

console.log("[BOOT] Allocating 50MB uninitialized RAM buffer pool...");
const memoryBuffer = Buffer.allocUnsafe(50 * 1024 * 1024);

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (url === "/probe" && method === "HEAD") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url === "/data" && method === "GET") {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized: Missing token access vector.");
      return;
    }

    const token = authHeader.split(" ")[1]!;
    const tokenParts = token.split(".");
    if (tokenParts.length !== 2) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: Malformed cryptographic signature structure.");
      return;
    }

    const [base64Payload, signature] = tokenParts;
    try {
      const decodedPayloadStr = Buffer.from(base64Payload!, "base64").toString(
        "utf8",
      );
      const payload = JSON.parse(decodedPayloadStr);

      const calculatedSignature = crypto
        .createHmac("sha256", ORCHESTRATOR_SECRET)
        .update(decodedPayloadStr)
        .digest("hex");

      if (calculatedSignature !== signature) {
        res.writeHead(403);
        res.end("Forbidden: Cryptographic signature mismatch.");
        return;
      }

      if (
        Date.now() > payload.exp ||
        payload.targetNode !== networkProfile.id
      ) {
        res.writeHead(403);
        res.end("Forbidden: Token window expired or target mismatch.");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
      });

      const streamData = () => {
        while (true) {
          const activeDrain = res.write(memoryBuffer);
          if (!activeDrain) {
            res.once("drain", streamData);
            break;
          }
        }
      };
      streamData();
    } catch {
      res.writeHead(403);
      res.end("Forbidden: Unparseable security token validation envelope.");
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

const registerWithGateway = () => {
  const payload = JSON.stringify({
    id: networkProfile.id,
    host: networkProfile.host,
    port: networkProfile.port,
    latitude: networkProfile.latitude,
    longitude: networkProfile.longitude,
    isp: networkProfile.isp,
    city: networkProfile.city,
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

  req.on("error", () => {
    console.warn(
      `[HEARTBEAT] Orchestrator offline. Retrying configuration block next cycle...`,
    );
  });

  req.write(payload);
  req.end();
};

discoverNetworkTopology().then(() => {
  server.listen(PORT, () => {
    console.log(
      `[ENGINE] NT-Pulse Edge Target listening on port ${PORT} as [${networkProfile.id}]`,
    );

    registerWithGateway();
    setInterval(registerWithGateway, 15000);
  });
});
