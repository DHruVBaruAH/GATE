import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// GATE CS subjects and topics
export const GATE_SUBJECTS = {
  PROGRAMMING: "programming",
  DSA: "data_structures_algorithms", 
  DBMS: "database_management",
  OS: "operating_systems",
  CN: "computer_networks",
  COA: "computer_organization",
  TOC: "theory_of_computation",
  COMPILER: "compiler_design",
  DISCRETE: "discrete_mathematics",
  LINEAR: "linear_algebra",
  PROBABILITY: "probability_statistics",
  APTITUDE: "general_aptitude"
} as const;

export const subjectValidator = v.union(
  v.literal(GATE_SUBJECTS.PROGRAMMING),
  v.literal(GATE_SUBJECTS.DSA),
  v.literal(GATE_SUBJECTS.DBMS),
  v.literal(GATE_SUBJECTS.OS),
  v.literal(GATE_SUBJECTS.CN),
  v.literal(GATE_SUBJECTS.COA),
  v.literal(GATE_SUBJECTS.TOC),
  v.literal(GATE_SUBJECTS.COMPILER),
  v.literal(GATE_SUBJECTS.DISCRETE),
  v.literal(GATE_SUBJECTS.LINEAR),
  v.literal(GATE_SUBJECTS.PROBABILITY),
  v.literal(GATE_SUBJECTS.APTITUDE)
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      
      // Study profile
      studyStreak: v.optional(v.number()),
      totalStudyHours: v.optional(v.number()),
      level: v.optional(v.number()),
      experience: v.optional(v.number()),
      avatarType: v.optional(v.string()),
      preferences: v.optional(v.object({
        theme: v.string(),
        soundscape: v.string(),
        pomodoroLength: v.number(),
        shortBreak: v.number(),
        longBreak: v.number(),
        focusMonitoring: v.boolean(),
      })),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Study sessions
    studySessions: defineTable({
      userId: v.id("users"),
      subject: subjectValidator,
      topic: v.string(),
      startTime: v.number(),
      endTime: v.optional(v.number()),
      duration: v.optional(v.number()), // in minutes
      focusScore: v.optional(v.number()), // 0-100
      isCompleted: v.boolean(),
      sessionType: v.union(v.literal("pomodoro"), v.literal("free"), v.literal("exam_simulation")),
      notes: v.optional(v.string()),
    }).index("by_user", ["userId"])
      .index("by_user_and_subject", ["userId", "subject"])
      .index("by_user_and_date", ["userId", "startTime"]),

    // Progress tracking
    subjectProgress: defineTable({
      userId: v.id("users"),
      subject: subjectValidator,
      topicsCompleted: v.array(v.string()),
      totalTopics: v.number(),
      hoursSpent: v.number(),
      averageFocusScore: v.number(),
      lastStudied: v.number(),
      weakTopics: v.array(v.string()),
    }).index("by_user", ["userId"])
      .index("by_user_and_subject", ["userId", "subject"]),

    // Achievements and badges
    achievements: defineTable({
      userId: v.id("users"),
      type: v.union(
        v.literal("streak"),
        v.literal("hours"),
        v.literal("focus"),
        v.literal("subject_master"),
        v.literal("consistency")
      ),
      title: v.string(),
      description: v.string(),
      icon: v.string(),
      unlockedAt: v.number(),
      value: v.number(), // streak days, hours, etc.
    }).index("by_user", ["userId"])
      .index("by_user_and_type", ["userId", "type"]),

    // Quiz and flashcard system
    quizzes: defineTable({
      userId: v.id("users"),
      subject: subjectValidator,
      topic: v.string(),
      questions: v.array(v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctAnswer: v.number(),
        explanation: v.string(),
      })),
      difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
      isGenerated: v.boolean(), // AI generated or manual
    }).index("by_user_and_subject", ["userId", "subject"]),

    // Flashcards
    flashcards: defineTable({
      userId: v.id("users"),
      subject: subjectValidator,
      topic: v.string(),
      front: v.string(),
      back: v.string(),
      difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
      nextReview: v.number(),
      interval: v.number(), // spaced repetition interval
      easeFactor: v.number(),
      reviewCount: v.number(),
    }).index("by_user_and_subject", ["userId", "subject"])
      .index("by_user_and_review", ["userId", "nextReview"]),

    // Focus sessions and analytics
    focusMetrics: defineTable({
      userId: v.id("users"),
      sessionId: v.id("studySessions"),
      timestamp: v.number(),
      focusLevel: v.number(), // 0-100
      distractionCount: v.number(),
      keystrokes: v.optional(v.number()),
      mouseMovements: v.optional(v.number()),
    }).index("by_session", ["sessionId"])
      .index("by_user_and_time", ["userId", "timestamp"]),

    // Blocked websites/apps
    blockedSites: defineTable({
      userId: v.id("users"),
      url: v.string(),
      category: v.string(),
      isActive: v.boolean(),
    }).index("by_user", ["userId"]),

    // Daily goals and targets
    dailyGoals: defineTable({
      userId: v.id("users"),
      date: v.string(), // YYYY-MM-DD format
      studyHoursTarget: v.number(),
      studyHoursActual: v.number(),
      subjectsTarget: v.array(subjectValidator),
      subjectsCompleted: v.array(subjectValidator),
      focusScoreTarget: v.number(),
      focusScoreActual: v.number(),
      isCompleted: v.boolean(),
    }).index("by_user_and_date", ["userId", "date"]),

    // Exam attempts (stores generated questions, answers, results, and guidance)
    examAttempts: defineTable({
      userId: v.id("users"),
      questions: v.array(v.object({
        id: v.number(),
        type: v.union(v.literal("mcq"), v.literal("nat")),
        question: v.string(),
        options: v.optional(v.array(v.string())),
        answer: v.optional(v.union(v.number(), v.string())),
        marks: v.optional(v.number()),
        topic: v.optional(v.string()),
        explanation: v.optional(v.string()),
      })),
      answers: v.record(v.string(), v.union(v.number(), v.string())),
      score: v.number(),
      total: v.number(),
      durationSec: v.number(),
      guidance: v.object({
        weakTopics: v.array(v.string()),
        suggestions: v.array(v.string()),
      }),
      completed: v.boolean(),
      startedAt: v.number(),
      submittedAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;