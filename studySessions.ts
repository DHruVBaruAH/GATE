import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const startSession = mutation({
  args: {
    subject: v.union(
      v.literal("programming"),
      v.literal("data_structures_algorithms"),
      v.literal("database_management"),
      v.literal("operating_systems"),
      v.literal("computer_networks"),
      v.literal("computer_organization"),
      v.literal("theory_of_computation"),
      v.literal("compiler_design"),
      v.literal("discrete_mathematics"),
      v.literal("linear_algebra"),
      v.literal("probability_statistics"),
      v.literal("general_aptitude")
    ),
    topic: v.string(),
    sessionType: v.union(v.literal("pomodoro"), v.literal("free"), v.literal("exam_simulation")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    return await ctx.db.insert("studySessions", {
      userId: user._id,
      subject: args.subject,
      topic: args.topic,
      startTime: Date.now(),
      isCompleted: false,
      sessionType: args.sessionType,
    });
  },
});

export const endSession = mutation({
  args: {
    sessionId: v.id("studySessions"),
    focusScore: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id) {
      throw new Error("Session not found");
    }

    const endTime = Date.now();
    const duration = Math.floor((endTime - session.startTime) / (1000 * 60)); // minutes

    await ctx.db.patch(args.sessionId, {
      endTime,
      duration,
      focusScore: args.focusScore,
      notes: args.notes,
      isCompleted: true,
    });

    // Update user's total study hours
    const totalMinutes = (user.totalStudyHours || 0) * 60 + duration;
    await ctx.db.patch(user._id, {
      totalStudyHours: Math.floor(totalMinutes / 60),
    });

    return session;
  },
});

export const getUserSessions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("studySessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit || 50);
  },
});

export const getTodaysSessions = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    return await ctx.db
      .query("studySessions")
      .withIndex("by_user_and_date", (q) => 
        q.eq("userId", user._id).gte("startTime", todayStart)
      )
      .collect();
  },
});
