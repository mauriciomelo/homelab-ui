import { getAppConfig } from "./app/(dashboard)/apps/config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { publishService } = await import("./mdns");

    if (!getAppConfig().SKIP_MDNS) {
      publishService();
    }
  }
}
