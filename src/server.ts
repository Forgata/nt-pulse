import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";

const BUFFER_SIZE_MB = Number(process.env.BUFFER_SIZE) || 50;
const BUFFER_SIZE_BYTES = BUFFER_SIZE_MB * 1024 * 1024;

console.log(
  `[BOOT] Allocating ${BUFFER_SIZE_MB}MB uninitialized RAM buffer pool...`,
);
const staticBuffer = Buffer.allocUnsafe(BUFFER_SIZE_BYTES);

crypto.randomFillSync(staticBuffer);
console.log(`[BOOT] Static entropy buffer locked in system RAM.`);

const PORT = process.env.PORT || 4001;
const server = http.createServer((req, res) => {
  const { method, url } = req;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && url === "/download") {
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "cache-control":
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      expires: "0",
      pragma: "no-cache",
    });

    const writeStream = () => {
      while (!res.destroyed) {
        const canContinue = res.write(staticBuffer);

        if (!canContinue) {
          break;
        }
      }
    };

    res.on("drain", writeStream);
    writeStream();

    req.on("close", () => {
      res.end();
    });
    return;
  }

  if (method === "POST" && url === "/upload") {
    req.on("data", (_chunk) => {
      // No assignments made here.
      // V8 garbage collection drops this reference immediately out of memory.
    });

    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "success",
          bytesProcessed: req.socket.bytesRead,
        }),
      );
    });

    req.on("error", (err) => {
      console.error(`[STREAM ERROR] Target Upload Failure: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Route Not Found");
});

server.listen(PORT, () => {
  console.log(`[ENGINE] NT-Pulse Edge Target listening on port ${PORT}`);
});

const registerWithGateway = () => {
  const payload = JSON.stringify({
    id: "edge-blantyre",
    host: "localhost",
    port: PORT,
    latitude: -15.7861,
    longitude: 35.0058,
  });

  const options: http.RequestOptions = {
    hostname: "localhost",
    port: 4000,
    path: "/register",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log(
        `[HEARTBEAT] Core check-in acknowledged by Orchestrator Gateway.`,
      );
    }
  });

  req.on("error", (err) => {
    console.log(`[HEARTBEAT WARN] Orchestrator unreachable: ${err.message}`);
  });

  req.write(payload);
  req.end();
};

setTimeout(registerWithGateway, 1000);
setInterval(registerWithGateway, 15000);
