import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const updateSubjectProgress = mutation({
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
    topicCompleted: v.string(),
    hoursSpent: v.number(),
    focusScore: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("subjectProgress")
      .withIndex("by_user_and_subject", (q) => 
        q.eq("userId", user._id).eq("subject", args.subject)
      )
      .unique();

    if (existing) {
      const updatedTopics = existing.topicsCompleted.includes(args.topicCompleted)
        ? existing.topicsCompleted
        : [...existing.topicsCompleted, args.topicCompleted];

      await ctx.db.patch(existing._id, {
        topicsCompleted: updatedTopics,
        hoursSpent: existing.hoursSpent + args.hoursSpent,
        averageFocusScore: (existing.averageFocusScore + args.focusScore) / 2,
        lastStudied: Date.now(),
      });
    } else {
      await ctx.db.insert("subjectProgress", {
        userId: user._id,
        subject: args.subject,
        topicsCompleted: [args.topicCompleted],
        totalTopics: 50, // Default, can be updated
        hoursSpent: args.hoursSpent,
        averageFocusScore: args.focusScore,
        lastStudied: Date.now(),
        weakTopics: [],
      });
    }
  },
});

export const getUserProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("subjectProgress")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const getWeeklyStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const sessions = await ctx.db
      .query("studySessions")
      .withIndex("by_user_and_date", (q) => 
        q.eq("userId", user._id).gte("startTime", weekAgo)
      )
      .collect();

    const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 60;
    const avgFocusScore = sessions.length > 0 
      ? sessions.reduce((sum, session) => sum + (session.focusScore || 0), 0) / sessions.length
      : 0;

    const subjectHours = sessions.reduce((acc, session) => {
      acc[session.subject] = (acc[session.subject] || 0) + (session.duration || 0) / 60;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalHours,
      avgFocusScore,
      sessionsCount: sessions.length,
      subjectHours,
    };
  },
});
