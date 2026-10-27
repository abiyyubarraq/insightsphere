import { Context } from "hono";
import {
  DocumentProcessRequest,
  DocumentProcessResponse,
} from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import type { OpenAIClient } from "../../lib/openaiClient.ts";
import { keyFailureResponse } from "../../lib/openaiErrors.ts";
import type { ChosenClient } from "../../lib/openaiForUser.ts";
import { openAIForUser } from "../../lib/userOpenAI.ts";
import { currentUser } from "../../lib/auth.ts";
import { documentInProject, projectIdShape } from "../../lib/documentAccess.ts";
import {
  chargeUserQuotaForWork,
  quotaExceeded,
  QuotaUnavailableError,
  quotaUnavailable,
} from "../../lib/quotaService.ts";
import {
  buildSummaryInput,
  buildSummaryRequest,
  documentRefusal,
  pagesRefusal,
} from "../../lib/summaryInput.ts";
import { runSummary } from "../../lib/summaryRun.ts";
import { errorInfo } from "../../lib/logSafe.ts";

const SUMMARY_TIMEOUT_MS = 60_000;

export async function generateSummary(c: Context) {
  const startTime = Date.now();
  // Declared here so the catch below knows whether the failing key was the
  // user's own.
  let openai: ChosenClient<OpenAIClient> | null = null;
  try {
    const user = currentUser(c);
    const body = await c.req.json();
    const { project_id, document_id }: DocumentProcessRequest = body;
    const regenerate = body.regenerate === true;

    if (!project_id || !document_id) {
      return c.json(
        {
          success: false,
          error: "Missing required fields: project_id, document_id",
        } as DocumentProcessResponse,
        400,
      );
    }

    // A missing and another user's document get the same 404, before any
    // claim, quota charge or OpenAI call.
    const document = await supabaseService.findDocument(document_id, user.id);
    if (!document) {
      return c.json(
        {
          success: false,
          error: "Document not found.",
        } as DocumentProcessResponse,
        404,
      );
    }

    if (projectIdShape(project_id) === "not_found") {
      return c.json(
        {
          success: false,
          error: "Document not found in this project.",
        } as DocumentProcessResponse,
        404,
      );
    }

    const hasProjectAccess = await supabaseService.validateProjectAccess(
      project_id,
      user.id,
    );
    if (!hasProjectAccess) {
      return c.json(
        {
          success: false,
          error: "Access denied to project",
        } as DocumentProcessResponse,
        403,
      );
    }

    // Before the quota charge and the OpenAI call, so a refused request costs nothing.
    if (documentInProject(document, user.id, project_id) === "not_found") {
      return c.json(
        {
          success: false,
          error: "Document not found in this project.",
        } as DocumentProcessResponse,
        404,
      );
    }

    // Each call sends up to SUMMARY_INPUT_MAX_CHARS of text, the most
    // expensive single request in the app, so an existing summary is not
    // redone by accident.
    if (document.is_summary_exist && !regenerate) {
      return c.json(
        {
          success: false,
          error: "This document already has a summary.",
        } as DocumentProcessResponse,
        409,
      );
    }

    const refusal = documentRefusal(document);
    if (refusal) {
      return c.json(
        { success: false, error: refusal.error } as DocumentProcessResponse,
        refusal.status,
      );
    }

    // Read only after the ownership and project checks above.
    const pageTexts = await supabaseService.getDocumentPageTexts(document_id);
    const pageRefusal = pagesRefusal(pageTexts);
    if (pageRefusal) {
      return c.json(
        { success: false, error: pageRefusal.error } as DocumentProcessResponse,
        pageRefusal.status,
      );
    }

    const input = buildSummaryInput(pageTexts);
    console.log("Summarizing document:", {
      document_id,
      pageCount: pageTexts.length,
      inputLength: input.text.length,
      sampled: input.sampled,
    });

    openai = await openAIForUser(user.id);
    const { client } = openai;

    const run = await chargeUserQuotaForWork(
      { own: openai.own, userId: user.id, kind: "summaries" },
      (billed) =>
        runSummary({
          generate: () =>
            client.generateChatCompletion(
              buildSummaryRequest(input, AbortSignal.timeout(SUMMARY_TIMEOUT_MS)),
            ),
          save: async (summary) => {
            await supabaseService.updateDocument(document_id, {
              summary,
              is_summary_exist: true,
            });
          },
        }, billed),
    );
    if (!run.allowed) return quotaExceeded(c, "summaries", run.limit);

    console.log("Summary saved:", { document_id, summaryLength: run.value });
    return c.json(
      {
        success: true,
        document_id: document_id,
        processing_time_ms: Date.now() - startTime,
      },
      200
    );
  } catch (error) {
    if (error instanceof QuotaUnavailableError) {
      console.error("Quota check failed before summary");
      return quotaUnavailable(c);
    }
    console.error("Summary generation failed:", errorInfo(error));

    const keyFailure = keyFailureResponse(c, openai?.own ?? false, error);
    if (keyFailure) return keyFailure;

    const processingTime = Date.now() - startTime;

    return c.json(
      {
        success: false,
        document_id: "",
        processing_time_ms: processingTime,
        error: "Could not generate the summary",
      },
      500
    );
  }
}
