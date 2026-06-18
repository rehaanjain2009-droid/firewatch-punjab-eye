import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HandleSchema = z.object({
  handle: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_]{5,32}$/u, "Telegram handle must be 5-32 letters, digits, or underscores"),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, email, telegram_handle, telegram_chat_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertTelegramHandle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { handle: string }) => HandleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const normalized = data.handle.replace(/^@/, "");
    const { error } = await context.supabase
      .from("profiles")
      .upsert(
        {
          user_id: context.userId,
          telegram_handle: normalized,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, handle: normalized };
  });
