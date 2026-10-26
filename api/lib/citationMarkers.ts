/**
 * Clean `[doc_id: N]` citation markers in model text.
 *
 * Kept free of client imports so it can be tested.
 */

import type { HistoryTurn } from "./queryRewrite.ts";

// The same marker shape the frontend turns into chips.
const MARKER = /([ \t]*)\[doc_id:\s*(\d+(?:,\s*\d+)*)\]/g;
// A run of markers with the spaces around them, so adjacent markers removed
// together leave one gap, not two.
const MARKER_RUN = /([ \t]*)((?:\[doc_id:\s*\d+(?:,\s*\d+)*\][ \t]*)+)/g;
const PUNCTUATION_AFTER = /^[.,;:!?)]/;
const WORD_AFTER = /^[\p{L}\p{N}]/u;

/**
 * Rewrites every marker to the ids `keep` returns for it. A marker left with no
 * id is removed together with the spaces before it, and one space stays only
 * when text follows that is not punctuation.
 */
function rewriteMarkers(
  text: string,
  keep: (ids: number[]) => number[],
): string {
  return text.replace(
    MARKER_RUN,
    (match: string, lead: string, run: string, offset: number, all: string) => {
      let changed = false;
      const rewritten = run.replace(MARKER, (marker: string, space: string, list: string) => {
        const ids = list.split(",").map((id) => Number.parseInt(id.trim(), 10));
        const kept = keep(ids);
        if (kept.join() === ids.join()) return marker;
        changed = true;
        return kept.length > 0 ? `${space}[doc_id: ${kept.join(", ")}]` : "";
      });
      if (!changed) return match;
      if (rewritten.trim()) return lead + rewritten.trimStart();

      const before = all[offset - 1];
      const after = all.slice(offset + match.length);
      if (before === undefined || before === "\n") return lead;
      if (after === "" || /^\r?\n/.test(after) || PUNCTUATION_AFTER.test(after)) {
        return "";
      }
      return /[ \t]$/.test(run) || WORD_AFTER.test(after) ? " " : "";
    },
  );
}

/** Removes every citation marker. */
export function stripCitationMarkers(text: string): string {
  return rewriteMarkers(text, () => []);
}

/**
 * Keeps only ids 1..sourceCount, in order and without repeats. Anything else
 * points at a source the answer does not have.
 */
export function keepValidCitationIds(text: string, sourceCount: number): string {
  return rewriteMarkers(text, (ids) => [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id >= 1 && id <= sourceCount)),
  ]);
}

interface HistoryMessage {
  role: string;
  content: string;
}

/**
 * Earlier answers lose their markers before they go into a prompt. Their
 * numbers pointed at that answer's sources, and the model copied them into the
 * new answer, where they point at nothing or at the wrong source.
 */
export function historyForPrompt<T extends HistoryMessage>(
  messages: T[],
): { messages: T[]; turns: HistoryTurn[] } {
  const cleaned = messages.map((message) =>
    message.role === "assistant"
      ? { ...message, content: stripCitationMarkers(message.content) }
      : message
  );
  const turns = cleaned
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role as HistoryTurn["role"],
      content: message.content,
    }));
  return { messages: cleaned, turns };
}
