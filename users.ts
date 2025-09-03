import { getAuthUserId } from "@convex-dev/auth/server";
import { query, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

export const updatePreferences = mutation({
  args: {
    theme: v.string(),
    soundscape: v.string(),
    pomodoroLength: v.number(),
    shortBreak: v.number(),
    longBreak: v.number(),
    focusMonitoring: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Add strict validation and descriptive errors
    const allowedThemes = new Set(["light", "dark"]);
    if (!allowedThemes.has(args.theme)) {
      throw new Error("Invalid theme. Allowed: light, dark.");
    }

    const allowedSoundscapes = new Set(["none", "rain", "lofi", "forest"]);
    if (!allowedSoundscapes.has(args.soundscape)) {
      throw new Error("Invalid soundscape. Allowed: none, rain, lofi, forest.");
    }

    const isFinitePositiveInt = (n: number) =>
      Number.isFinite(n) && Number.isInteger(n) && n > 0;

    if (!isFinitePositiveInt(args.pomodoroLength) || args.pomodoroLength > 180) {
      throw new Error("Invalid Pomodoro length. Use an integer between 1 and 180 minutes.");
    }
    if (!isFinitePositiveInt(args.shortBreak) || args.shortBreak > 60) {
      throw new Error("Invalid short break. Use an integer between 1 and 60 minutes.");
    }
    if (!isFinitePositiveInt(args.longBreak) || args.longBreak > 60) {
      throw new Error("Invalid long break. Use an integer between 1 and 60 minutes.");
    }

    await ctx.db.patch(user._id, {
      preferences: {
        theme: args.theme,
        soundscape: args.soundscape,
        pomodoroLength: args.pomodoroLength,
        shortBreak: args.shortBreak,
        longBreak: args.longBreak,
        focusMonitoring: args.focusMonitoring,
      },
    });
  },
});