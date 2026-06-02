import http from "node:http";
import type { clientProfile } from "./types.js";

export function discoverClientTopology(
  clientProfile: clientProfile,
): Promise<void> {
  return new Promise((resolve) => {
    console.log(
      "\n[BOOT] Querying public network topology for client allocation...",
    );
    http
      .get("http://ip-api.com/json/", (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data && data.status === "success") {
              clientProfile.latitude = data.lat;
              clientProfile.longitude = data.lon;
              clientProfile.isp = data.isp;
              console.log(
                `[AUTODISCOVER] Client Located! ISP: ${data.isp} | Vectors: [${data.lat}, ${data.lon}]`,
              );
            }
          } catch {}
          resolve();
        });
      })
      .on("error", () => {
        console.warn(
          "[AUTODISCOVER] Network unreachable. Utilizing regional baseline vectors.",
        );
        resolve();
      });
  });
}
