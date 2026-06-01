import crypto from "node:crypto";

export function generateSignedToken(
  payload: object,
  ORCHESTRATOR_SECRET: string,
): string {
  const stringifiedPayload = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", ORCHESTRATOR_SECRET)
    .update(stringifiedPayload)
    .digest("hex");
  return `${Buffer.from(stringifiedPayload).toString("base64")}.${signature}`;
}
