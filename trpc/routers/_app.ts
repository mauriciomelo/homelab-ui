import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { getApps } from "@/app/api/applications";
import { devices } from "@/app/api/devices";
import { getDiscoveredNodes } from "@/mdns";
export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(
      z.object({
        text: z.string(),
      })
    )
    .query((opts) => {
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),

  apps: baseProcedure.query(() => {
    return getApps();
  }),
  devices: baseProcedure.query(() => {
    return devices();
  }),
  discoveredNodes: baseProcedure.query(() => {
    return getDiscoveredNodes();
  }),
});

export type AppRouter = typeof appRouter;
