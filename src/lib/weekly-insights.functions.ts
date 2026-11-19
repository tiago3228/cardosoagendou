import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ weekOffset: z.number().int().min(-52).max(0), generate: z.boolean().optional() });

export const getWeeklyInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.input<typeof input>) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { readWeeklyInsights } = await import("./weekly-insights.server");
    return readWeeklyInsights(context.supabase, context.userId, { weekOffset: data.weekOffset, generate: data.generate ?? false });
  });