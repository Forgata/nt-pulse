import "dotenv/config";
import type { NetworkProfile } from "./types.js";
const EDGE_PORT = parseInt(process.env.EDGE_PORT || "4001");
const ORCHESTRATION_PORT = parseInt(process.env.ORCHESTRATION_PORT || "4000");

export async function resolveDynamicNetworkProfile(
  networkProfile: NetworkProfile,
) {
  try {
    console.log(
      "[BOOT] Querying upstream routing matrix for public IP and geo vectors...",
    );

    const response = await fetch(
      "http://ip-api.com/json/?fields=status,message,query,lat,lon,isp,city",
    );

    if (!response.ok) {
      throw new Error(
        `Upstream infrastructure returned status: ${response.status}`,
      );
    }

    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(`Profile localization failed: ${data.message}`);
    }

    // networkProfile.host = data.query; ////  in prod
    networkProfile.host =
      process.env.NODE_ENV === "production" ? data.query : "127.0.0.1";
    networkProfile.latitude = parseFloat(data.lat);
    networkProfile.longitude = parseFloat(data.lon);
    networkProfile.isp = data.isp;
    networkProfile.city = data.city;

    console.log(
      `[BOOT] Topology Verified -> Host: ${networkProfile.host} | City: ${networkProfile.city} | ISP: ${networkProfile.isp} | Coords: [${networkProfile.latitude}, ${networkProfile.longitude}]`,
    );
  } catch (error: any) {
    console.error(
      "[WARN] Network profile discovery failed. Dropping back to loopback diagnostics.",
      error.message,
    );

    networkProfile.host = undefined!;
    networkProfile.latitude = undefined!;
    networkProfile.longitude = undefined!;
    networkProfile.isp = undefined!;
    networkProfile.city = undefined!;
  }
}

export async function registerWithOrchestrator(networkProfile: NetworkProfile) {
  try {
    console.log(
      "[BOOT] Dispatching topology profile to orchestrator control plane...",
    );

    const baseURL = process.env.RENDER_EXTERNAL_URL || "http://localhost:4002";
    const wsEndpoint = `${baseURL.replace("https://", "wss://")}/speedtest`;

    const registrationPayload = {
      ...networkProfile,
      wsEndpoint,
    };

    const orchestratorHost =
      process.env.ORCHESTRATION_HOST || "http://127.0.0.1:4000";

    const response = await fetch(`${orchestratorHost}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationPayload),
    });

    if (!response.ok) {
      throw new Error(
        `Orchestrator registration rejected with status: ${response.status}`,
      );
    }

    console.log(
      "[BOOT] Node successfully registered and pinned to active routing matrix.",
    );
  } catch (error: any) {
    console.error(
      "[CRITICAL] Failed to register with orchestrator:",
      error.message,
    );
  }
}
