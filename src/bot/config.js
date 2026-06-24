import "dotenv/config";

const adminIds = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

const groupChatIds = (process.env.GROUP_CHAT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminIds,
  groupChatIds,
  groupInviteLink: process.env.GROUP_INVITE_LINK ?? "",
  timezone: process.env.TIMEZONE ?? "Europe/Moscow",
  drawMinutesBefore: Number(process.env.DRAW_MINUTES_BEFORE ?? 30),
};

export function isAdmin(userId) {
  if (adminIds.length === 0) return true;
  return adminIds.includes(userId);
}

if (!config.botToken) {
  throw new Error("Set BOT_TOKEN in .env");
}
