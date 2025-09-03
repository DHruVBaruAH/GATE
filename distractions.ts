import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const listBlocked = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db.query("blockedSites").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").collect();
  },
});

export const addBlocked = mutation({
  args: {
    url: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Validate category
    const category = (args.category ?? "general").trim().toLowerCase();
    if (!/^[a-z0-9_ -]{3,32}$/.test(category)) {
      throw new Error("Invalid category. Use 3-32 chars: letters, numbers, spaces, underscores, or hyphens.");
    }

    // Normalize & validate URL/hostname
    const raw = args.url.trim();
    if (!raw) throw new Error("URL required");
    let normalizedHost = "";
    try {
      const withProto = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
      const u = new URL(withProto);
      if (!u.hostname) throw new Error("Invalid URL");
      normalizedHost = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (normalizedHost.length < 3 || normalizedHost.length > 253) {
        throw new Error("Invalid URL");
      }
    } catch {
      throw new Error("Invalid URL. Enter a valid domain like 'youtube.com'.");
    }

    // Limit and deduplicate
    const existing = await ctx.db
      .query("blockedSites")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (existing.length >= 200) {
      throw new Error("Blocklist limit reached (200). Remove some entries to add more.");
    }

    const already = existing.find((e) => e.url.toLowerCase() === normalizedHost);
    if (already) {
      return already._id;
    }

    return await ctx.db.insert("blockedSites", {
      userId: user._id,
      url: normalizedHost,
      category,
      isActive: true,
    });
  },
});

export const toggleBlockedActive = mutation({
  args: { id: v.id("blockedSites"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Blocked site not found.");
    if (doc.userId !== user._id) throw new Error("You do not have permission to modify this entry.");

    await ctx.db.patch(args.id, { isActive: args.isActive });
  },
});

export const removeBlocked = mutation({
  args: { id: v.id("blockedSites") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Blocked site not found.");
    if (doc.userId !== user._id) throw new Error("You do not have permission to delete this entry.");

    await ctx.db.delete(args.id);
  },
});