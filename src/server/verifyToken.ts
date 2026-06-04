import crypto from "node:crypto";
import "dotenv/config";
import type { NetworkProfile } from "./types.js";

const ORCHESTRATION_SECRET = process.env.ORCHESTRATION_SECRET;
if (!ORCHESTRATION_SECRET)
  throw new Error("ORCHESTRATION_SECRET environment variable is required.");

export function verifyToken(
  token: string,
  networkProfile: NetworkProfile,
): boolean {
  if (!token) return false;
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) return false;

  const [base64Payload, signature] = tokenParts;
  try {
    const decodedPayloadStr = Buffer.from(base64Payload!, "base64").toString(
      "utf8",
    );
    const payload = JSON.parse(decodedPayloadStr);

    const calculatedSignature = crypto
      .createHmac("sha256", ORCHESTRATION_SECRET!)
      .update(decodedPayloadStr)
      .digest("hex");

    if (calculatedSignature !== signature) return false;
    if (Date.now() > payload.exp || payload.targetNode !== networkProfile.id)
      return false;

    return true;
  } catch {
    return false;
  }
}
