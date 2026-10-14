import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Admin-editable settings, with the defaults used until someone changes them. */
export const SETTING_DEFAULTS = {
  "ai.provider": "gemini" as "gemini" | "openai",
  "qa.consume_on": "submit" as "submit" | "escalate",
  "qa.max_followups": 3,
  "mentor.reply_template": "Knock the mentor on this number on WhatsApp for the class link.",
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return (row?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[key];
}

export async function setSetting(key: SettingKey, value: unknown, by: number) {
  await db.insert(schema.settings).values({ key, value, updatedBy: by })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}
