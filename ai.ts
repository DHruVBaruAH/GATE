"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

type RawQuestion = {
  id?: number;
  type: "mcq" | "nat";
  question: string;
  options?: string[];
  answer?: number | string;
  marks?: number; // optional (1 or 2)
  topic?: string; // optional
  explanation?: string; // optional
};

const MODEL = "anthropic/claude-3-haiku";

export const generateExam = action({
  args: {
    subjectMix: v.optional(v.array(v.string())), // topics if you want to bias coverage
    numQuestions: v.optional(v.number()), // default 10 for quick demo
    difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
    includeExplanations: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    // Read API keys from envs and trim whitespace
    const rawOpenRouter =
      process.env.OPENROUTER_API_KEY ??
      process.env.VITE_OPENROUTER_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "";
    const rawAnthropic =
      process.env.ANTHROPIC_API_KEY ??
      process.env.VITE_ANTHROPIC_API_KEY ??
      "";
    const openrouterKey =
      typeof rawOpenRouter === "string" ? rawOpenRouter.trim() : "";
    const anthropicKey =
      typeof rawAnthropic === "string" ? rawAnthropic.trim() : "";

    const numQuestions = Math.min(Math.max(args.numQuestions ?? 10, 5), 65);
    const difficulty = args.difficulty ?? "mixed";
    const includeExplanations = args.includeExplanations ?? true;

    const topics = args.subjectMix && args.subjectMix.length > 0
      ? args.subjectMix
      : [
          "programming_and_dsa",
          "database_management",
          "operating_systems",
          "computer_networks",
          "computer_organization",
          "theory_of_computation",
          "compiler_design",
          "discrete_mathematics",
          "linear_algebra",
          "probability_statistics",
          "general_aptitude",
        ];

    const system = `
You are a GATE CS exam compiler. Generate questions strictly following GATE CSE style.
Output ONLY valid JSON (no backticks, no explanations outside JSON).
Format: an array of question objects with fields:
- id (number, incremental starting at 1)
- type ("mcq" | "nat")
- question (string)
- options (array of 4 strings; ONLY for "mcq")
- answer (number for "mcq" representing index [0..3], or string/number for "nat")
- marks (1 or 2)
- topic (string; one of the provided topics)
${includeExplanations ? '- explanation (string; concise, 1-3 lines)' : ''}

Constraints:
- Mix MCQ and NAT.
- Mix 1-mark and 2-mark.
- Cover a spread of topics from the provided list.
- Questions must be unambiguous, error-free, and solvable.
- NAT answers must be a short numeric (integer or decimal).
- If generating a full mock (65 questions): ~10 "general_aptitude" (1 mark each) + ~55 core questions with roughly 25 one-mark and 30 two-mark questions; keep a balanced mix of MCQ and NAT; ensure topic coverage across core CS subjects.
`.trim();

    const user = `
Generate ${numQuestions} questions.
Difficulty: ${difficulty}.
Topics to cover (spread): ${topics.join(", ")}.

Return ONLY a JSON array as described.
`.trim();

    const models: Array<string> = [
      "anthropic/claude-3-haiku",
      "mistralai/mixtral-8x7b-instruct",
      "openai/gpt-4o-mini",
    ];

    const maxTokens = numQuestions >= 50 ? 8000 : 3500;
    const temperature = 0.6;

    // OpenRouter flow (preferred when available)
    const tryOnceOpenRouter = async (model: string) => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://vly.ai",
          "X-Title": "GATE CS Domination",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Model ${model} error ${res.status}: ${text || res.statusText}`);
      }

      const data = await res.json();
      const content =
        data?.choices?.[0]?.message?.content ??
        (typeof data === "object" ? JSON.stringify(data) : String(data));

      const match = String(content).match(/\[[\s\S]*\]/);
      const jsonStr = match ? match[0] : content;

      let parsed: Array<RawQuestion>;
      try {
        parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
      } catch {
        throw new Error(`Failed to parse AI response for model ${model}.`);
      }

      const questions: Array<RawQuestion> = parsed.slice(0, numQuestions).map((q, idx) => {
        const type = q.type === "mcq" ? "mcq" : q.type === "nat" ? "nat" : "mcq";
        const marks = q.marks === 2 ? 2 : 1;

        if (type === "mcq") {
          const options = Array.isArray(q.options) && q.options.length === 4 ? q.options : ["A", "B", "C", "D"];
          const answer = typeof q.answer === "number" && q.answer >= 0 && q.answer <= 3 ? q.answer : 0;
          return {
            id: idx + 1,
            type,
            question: String(q.question ?? "Untitled"),
            options,
            answer,
            marks,
            topic: String(q.topic ?? topics[idx % topics.length]),
            ...(q.explanation ? { explanation: String(q.explanation) } : {}),
          };
        } else {
          const natAns = typeof q.answer === "number" || typeof q.answer === "string" ? q.answer : "0";
          return {
            id: idx + 1,
            type,
            question: String(q.question ?? "Untitled"),
            answer: natAns,
            marks,
            topic: String(q.topic ?? topics[idx % topics.length]),
            ...(q.explanation ? { explanation: String(q.explanation) } : {}),
          };
        }
      });

      return questions;
    };

    // Anthropic flow (when ANTHROPIC_API_KEY is provided)
    const tryAnthropic = async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Anthropic error ${res.status}: ${text || res.statusText}`);
      }

      const data = await res.json();
      const contentBlock = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === "text") : null;
      const content = contentBlock?.text ?? "";

      const match = String(content).match(/\[[\s\S]*\]/);
      const jsonStr = match ? match[0] : content;

      let parsed: Array<RawQuestion>;
      try {
        parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
      } catch {
        throw new Error("Failed to parse Anthropic response.");
      }

      const questions: Array<RawQuestion> = parsed.slice(0, numQuestions).map((q, idx) => {
        const type = q.type === "mcq" ? "mcq" : q.type === "nat" ? "nat" : "mcq";
        const marks = q.marks === 2 ? 2 : 1;

        if (type === "mcq") {
          const options = Array.isArray(q.options) && q.options.length === 4 ? q.options : ["A", "B", "C", "D"];
          const answer = typeof q.answer === "number" && q.answer >= 0 && q.answer <= 3 ? q.answer : 0;
          return {
            id: idx + 1,
            type,
            question: String(q.question ?? "Untitled"),
            options,
            answer,
            marks,
            topic: String(q.topic ?? topics[idx % topics.length]),
            ...(q.explanation ? { explanation: String(q.explanation) } : {}),
          };
        } else {
          const natAns = typeof q.answer === "number" || typeof q.answer === "string" ? q.answer : "0";
          return {
            id: idx + 1,
            type,
            question: String(q.question ?? "Untitled"),
            answer: natAns,
            marks,
            topic: String(q.topic ?? topics[idx % topics.length]),
            ...(q.explanation ? { explanation: String(q.explanation) } : {}),
          };
        }
      });

      return questions;
    };

    // Local fallback generator when providers are unavailable or out of credits
    const buildLocalQuestions = (
      n: number,
      topicsList: Array<string>,
      withExplanations: boolean,
    ): Array<RawQuestion> => {
      const arr: Array<RawQuestion> = [];
      const baseMCQs: Array<{ q: string; options: string[]; ans: number; topic: string }> = [
        { q: "Which data structure is most suitable for implementing a LRU cache?", options: ["Queue", "Stack", "Hash map + Doubly linked list", "Binary heap"], ans: 2, topic: "programming_and_dsa" },
        { q: "Which of the following is a lossless-join, dependency preserving normal form?", options: ["1NF", "2NF", "3NF", "BCNF (not always dependency preserving)"], ans: 2, topic: "database_management" },
        { q: "Which scheduling algorithm can lead to starvation without aging?", options: ["Round Robin", "FCFS", "SJF", "Priority (preemptive)"], ans: 3, topic: "operating_systems" },
        { q: "In networking, which layer is responsible for end-to-end reliable delivery?", options: ["Application", "Transport", "Network", "Link"], ans: 1, topic: "computer_networks" },
        { q: "Which of the following is NOT typically part of a CPU pipeline stage?", options: ["Fetch", "Decode", "Execute", "Fragment"], ans: 3, topic: "computer_organization" },
        { q: "Which language class is recognized by a deterministic finite automaton (DFA)?", options: ["Context-sensitive", "Context-free", "Regular", "Recursively enumerable"], ans: 2, topic: "theory_of_computation" },
        { q: "Which phase of a compiler performs lexical analysis?", options: ["Frontend: Lexer", "Frontend: Parser", "Backend: Code generation", "Optimizer"], ans: 0, topic: "compiler_design" },
        { q: "Which statement is TRUE about a simple undirected graph?", options: ["Self-loops are allowed", "Multiple edges are allowed", "Degree sum equals twice the number of edges", "All nodes have the same degree"], ans: 2, topic: "discrete_mathematics" },
      ];
      const baseNATs: Array<{ q: string; ans: number | string; topic: string }> = [
        { q: "Compute the determinant of [[1,2],[3,4]].", ans: -2, topic: "linear_algebra" },
        { q: "If X~Bernoulli(p) with p=0.3, what is Var(X)? Enter as decimal.", ans: 0.21, topic: "probability_statistics" },
        { q: "Find the derivative of f(x)=3x^2 at x=2.", ans: 12, topic: "programming_and_dsa" },
      ];
      const total = Math.max(5, Math.min(65, n));
      for (let i = 0; i < total; i++) {
        // Alternate MCQ and NAT; balance marks; spread topics
        const isMcq = i % 2 === 0;
        const marks = i % 3 === 0 ? 2 : 1;
        const topic = topicsList[i % topicsList.length] ?? "general_aptitude";

        if (isMcq) {
          const pick = baseMCQs[(i / 2) % baseMCQs.length | 0];
          arr.push({
            id: i + 1,
            type: "mcq",
            question: pick.q,
            options: pick.options,
            answer: pick.ans,
            marks,
            topic: pick.topic || topic,
            ...(withExplanations
              ? { explanation: "Reason about definitions and standard properties; select the logically valid option." }
              : {}),
          });
        } else {
          const pick = baseNATs[(i / 2) % baseNATs.length | 0];
          arr.push({
            id: i + 1,
            type: "nat",
            question: pick.q,
            answer: pick.ans,
            marks,
            topic: pick.topic || topic,
            ...(withExplanations ? { explanation: "Apply standard formula or computation to obtain the numeric result." } : {}),
          });
        }
      }
      return arr;
    };

    // Provider selection: Prefer Anthropic first if present, then OpenRouter
    if (anthropicKey) {
      try {
        return await tryAnthropic();
      } catch (firstErr) {
        const anthroErrMsg =
          firstErr instanceof Error ? firstErr.message : String(firstErr);

        if (openrouterKey) {
          try {
            // Try OpenRouter models in order
            const errors: Array<string> = [];
            for (const model of models) {
              try {
                const questions = await tryOnceOpenRouter(model);
                return questions;
              } catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
                continue;
              }
            }
            // Final small retry attempt
            const reduced = Math.min(
              30,
              Math.max(10, Math.floor((args.numQuestions ?? 10) / 2)),
            );
            void reduced; // prompt already constrained; keep minimal code changes

            return await tryOnceOpenRouter(models[0].toString().trim());
          } catch (_secondErr) {
            // Fallback to local generation if external providers fail
            return buildLocalQuestions(numQuestions, topics, includeExplanations);
          }
        }

        // No OpenRouter fallback available — generate locally
        return buildLocalQuestions(numQuestions, topics, includeExplanations);
      }
    } else if (openrouterKey) {
      const errors: Array<string> = [];
      // Try OpenRouter models
      for (const model of models) {
        try {
          const questions = await tryOnceOpenRouter(model);
          return questions;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
          continue;
        }
      }

      // If OpenRouter failed, try Anthropic if available
      if (anthropicKey) {
        try {
          return await tryAnthropic();
        } catch (_e) {
          // Fallback to local generation after both providers fail
          return buildLocalQuestions(numQuestions, topics, includeExplanations);
        }
      }

      // No Anthropic fallback; one last OpenRouter attempt then local fallback
      try {
        const fallbackQuestions = await (async () => {
          const reduced = Math.min(
            30,
            Math.max(10, Math.floor((args.numQuestions ?? 10) / 2)),
          );
          void reduced;
          return await tryOnceOpenRouter(models[0].toString().trim());
        })();
        return fallbackQuestions;
      } catch (_e) {
        // Final local fallback
        return buildLocalQuestions(numQuestions, topics, includeExplanations);
      }
    } else {
      // No keys configured at all — generate locally
      return buildLocalQuestions(numQuestions, topics, includeExplanations);
    }
  },
});