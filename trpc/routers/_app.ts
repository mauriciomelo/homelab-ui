import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { getApps } from "@/app/api/applications";
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
});

export type AppRouter = typeof appRouter;
