import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

const answerValue = v.union(v.number(), v.string());

const questionValidator = v.object({
  id: v.number(),
  type: v.union(v.literal("mcq"), v.literal("nat")),
  question: v.string(),
  options: v.optional(v.array(v.string())),
  answer: v.optional(answerValue),
  marks: v.optional(v.number()),
  topic: v.optional(v.string()),
  explanation: v.optional(v.string()),
});

export const createAttempt = mutation({
  args: {
    questions: v.array(questionValidator),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const attemptId = await ctx.db.insert("examAttempts", {
      userId: user._id,
      questions: args.questions,
      answers: {},
      score: 0,
      total: args.questions.length,
      durationSec: 0,
      guidance: {
        weakTopics: [],
        suggestions: [],
      },
      completed: false,
      startedAt: Date.now(),
      submittedAt: undefined,
    });

    return attemptId;
  },
});

export const submitAttempt = mutation({
  args: {
    attemptId: v.id("examAttempts"),
    answers: v.record(v.string(), answerValue),
    durationSec: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.userId !== user._id) throw new Error("Not authorized to submit this attempt");
    if (attempt.completed) throw new Error("Attempt already submitted");

    const questions = attempt.questions as Array<{
      id: number;
      type: "mcq" | "nat";
      answer?: number | string;
      topic?: string;
      marks?: number;
    }>;

    let score = 0;
    const mistakes: Array<{ id: number; topic: string; correct: string; yours: string }> = [];
    const topicStats: Record<string, { total: number; wrong: number }> = {};

    for (const q of questions) {
      const topic = (q.topic ?? "general_aptitude").toString();
      if (!topicStats[topic]) topicStats[topic] = { total: 0, wrong: 0 };
      topicStats[topic].total += 1;

      const userAns = args.answers[String(q.id)];
      if (q.type === "mcq") {
        const correctIndex = typeof q.answer === "number" ? q.answer : -1;
        if (typeof userAns === "number" && userAns === correctIndex) {
          score += 1;
        } else {
          topicStats[topic].wrong += 1;
          mistakes.push({
            id: q.id,
            topic,
            correct: String(correctIndex),
            yours: userAns === undefined ? "blank" : String(userAns),
          });
        }
      } else {
        const correctNat = typeof q.answer === "number" ? q.answer : Number(q.answer);
        const userVal = typeof userAns === "number" ? userAns : Number(userAns);
        if (!Number.isNaN(correctNat) && !Number.isNaN(userVal) && Math.abs(userVal - correctNat) < 0.01) {
          score += 1;
        } else {
          topicStats[topic].wrong += 1;
          mistakes.push({
            id: q.id,
            topic,
            correct: String(q.answer ?? ""),
            yours: userAns === undefined ? "blank" : String(userAns),
          });
        }
      }
    }

    // Build guidance: weak topics and suggestions
    const weakTopics = Object.entries(topicStats)
      .filter(([_, s]) => s.wrong > 0)
      .sort((a, b) => b[1].wrong - a[1].wrong)
      .map(([t]) => t)
      .slice(0, 4);

    const suggestions: Array<string> = [];
    if (weakTopics.length) {
      suggestions.push(`Focus next: ${weakTopics.map((t) => t.replace(/_/g, " ")).join(", ")}`);
    }
    suggestions.push(
      "Review basics first: definitions, standard formulas, and canonical properties.",
    );
    suggestions.push(
      "Practice 10 targeted problems per weak topic and redo similar questions.",
    );
    suggestions.push("Reattempt a shorter mock to validate improvements.");

    await ctx.db.patch(args.attemptId, {
      answers: args.answers,
      score,
      durationSec: Math.max(0, Math.floor(args.durationSec)),
      guidance: { weakTopics, suggestions },
      completed: true,
      submittedAt: Date.now(),
    });

    return {
      score,
      total: questions.length,
      weakTopics,
      suggestions,
      mistakes,
    };
  },
});

export const listAttempts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("examAttempts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(10);
  },
});
