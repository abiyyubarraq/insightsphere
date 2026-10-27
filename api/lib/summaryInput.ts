/**
 * What the summary call is given: the page text processing already stored,
 * capped, and the request around it. Pure: no client is built here.
 */

import type { ChatCompletionRequest } from "./openaiClient.ts";
import { SUMMARY_INPUT_MAX_CHARS } from "./constants.ts";
import { FILE_CONSTRAINTS } from "../../shared/constants/index.ts";

export const SUMMARY_MODEL = "gpt-4o-mini";
export const OMITTED_MARKER = "\n\n[... text omitted ...]\n\n";
export const SUMMARY_WINDOWS = 8;

export interface SummaryRefusal {
  status: 400 | 409;
  error: string;
}

/** Checked before any page read, quota charge or OpenAI call. */
export function documentRefusal(
  document: { status: string; file_name: string },
): SummaryRefusal | null {
  const extension = document.file_name.toLowerCase().split(".").pop() ?? "";
  if (!(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return { status: 400, error: "This file type cannot be summarized." };
  }
  if (document.status !== "ready") {
    return { status: 409, error: "This document is still being processed." };
  }
  return null;
}

/**
 * Storing pages can fail while processing carries on, so a ready document can
 * have none. Processing again stores them.
 */
export function pagesRefusal(pageTexts: string[]): SummaryRefusal | null {
  if (pageTexts.length === 0) {
    return { status: 409, error: "This document has no extracted text. Process it again." };
  }
  if (pageTexts.every((t) => t.trim() === "")) {
    return { status: 400, error: "This document has no text to summarize." };
  }
  return null;
}

export interface SummaryInput {
  text: string;
  /** True when the text is excerpts, not the whole document. */
  sampled: boolean;
}

/**
 * The whole text when it fits. Otherwise the first quarter of the cap, so the
 * title and introduction are kept, then SUMMARY_WINDOWS windows spread evenly
 * over the rest, the last one ending at the end of the text. Sampling is by
 * character on the joined text, so one huge TXT page is covered too.
 */
export function buildSummaryInput(
  pageTexts: string[],
  maxChars: number = SUMMARY_INPUT_MAX_CHARS,
): SummaryInput {
  const full = pageTexts.map((t) => t.trim()).filter(Boolean).join("\n\n");
  if (full.length <= maxChars) return { text: full, sampled: false };

  const headLength = Math.floor(maxChars / 4);
  const windowLength = Math.floor(
    (maxChars - headLength - SUMMARY_WINDOWS * OMITTED_MARKER.length) /
      SUMMARY_WINDOWS,
  );
  // Positive because the text is longer than the cap, so every gap really
  // leaves text out and each marker is true.
  const omitted = full.length - headLength - SUMMARY_WINDOWS * windowLength;

  const parts = [full.slice(0, headLength)];
  for (let i = 0; i < SUMMARY_WINDOWS; i++) {
    const start = headLength + i * windowLength +
      Math.floor(((i + 1) * omitted) / SUMMARY_WINDOWS);
    parts.push(full.slice(start, start + windowLength));
  }
  return { text: parts.join(OMITTED_MARKER), sampled: true };
}

const SYSTEM_PROMPT =
  `You are InsightSphere, an intelligent document analysis and summarization assistant.

## Core Instructions:
1. **Read and analyze** the document text thoroughly and comprehensively
2. **Generate a structured summary** that captures the document's essence, key insights, and main takeaways
3. **Preserve technical accuracy** and maintain important terminology from the original document
4. **Base your analysis solely** on the document text - do not add external knowledge
5. **Format your response** in clean, readable Markdown with proper structure

## Required Output Structure:
### 📄 Document Overview
- **Title:** [Extract or infer the document title]
- **Type:** [Identify document type: report, research paper, manual, etc.]
- **Purpose:** [Brief description of the document's main purpose]

### 📋 Executive Summary
[2-3 paragraph comprehensive summary covering the main content and findings]

### 🔑 Key Points
- [Bullet point 1: Main finding or argument]
- [Bullet point 2: Important insight or conclusion]
- [Bullet point 3: Critical information or recommendation]
- [Continue as needed for all major points]

### 📊 Important Details
[Include specific data, statistics, dates, names, or technical details that are crucial]

### 🎯 Key Takeaways
[3-5 bullet points highlighting the most important insights for someone who needs to understand this document quickly]

### 💡 Notable Terms & Concepts
[Important keywords, technical terms, or concepts that someone should know when working with this document]

**Note:** Ensure your summary is comprehensive yet concise, maintaining the document's original meaning while making it accessible to readers who need to quickly understand the content.`;

const WHOLE_TEXT = "The text below is the full text of the document.";
const EXCERPTS =
  "The document is too long to send in full. The text below is excerpts from the whole document: " +
  `the beginning, then evenly spaced parts of the rest. Each "[... text omitted ...]" line marks a gap. ` +
  "Summarize the whole document from these excerpts, and do not claim to have read every part of it.";

const ASK =
  "Please provide a comprehensive analysis and summary of the document. Focus on extracting the most important information, key insights, and actionable takeaways while maintaining accuracy to the original content.";

/** Text only: no file part, so every format goes the same way. */
export function buildSummaryRequest(
  input: SummaryInput,
  signal?: AbortSignal,
): ChatCompletionRequest {
  return {
    model: SUMMARY_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${input.sampled ? EXCERPTS : WHOLE_TEXT}\n\n${ASK}\n\n<document>\n${input.text}\n</document>`,
      },
    ],
    max_tokens: 3000,
    temperature: 0.1,
    top_p: 0.95,
    signal,
  };
}
