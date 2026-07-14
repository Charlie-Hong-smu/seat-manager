export function createAiPostRoutes(handlers) {
  return {
    "/auth": handlers.auth,
    "/analyze-trend": handlers.analyzeTrend,
    "/analyze-class": handlers.analyzeClass,
    "/chat-assistant": handlers.chatAssistant,
    "/student-followup": handlers.studentFollowup,
    "/generate-comment": handlers.generateComment,
    "/suggest-score-mapping": handlers.suggestScoreMapping,
    "/suggest-roster-mapping": handlers.suggestRosterMapping,
    "/generate-weekly-draft": handlers.generateWeeklyDraft,
    "/analyze-score-items": handlers.analyzeScoreItems,
  };
}
