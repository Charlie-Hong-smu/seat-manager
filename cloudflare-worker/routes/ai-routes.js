import { jsonResponse } from "../worker-response.js";
import { getBearerToken } from "../worker-auth.js";
import { MAX_BODY_BYTES, readJsonBody, toText } from "../worker-input.js";
import { verifyAiRequest, getAiLimitResponse, handleAuth } from "../worker-ai-access.js";
import { isValidTrendPayload, isValidClassPayload, isValidAssistantPayload, isValidScoreMappingPayload, isValidRosterMappingPayload, isValidStudentCommentPayload, isValidCommentRefinementPayload, isValidStudentFollowupPayload, isValidWeeklyDraftPayload, isValidScoreItemPayload, getStudentCommentLengthSettings, getStudentCommentMissingInfo, parseModelJson, sanitizeAiResult, sanitizeClassAiResult, sanitizeAssistantResult, sanitizeStudentFollowupResult, sanitizeWeeklyDraftResult, sanitizeScoreItemResult, sanitizeScoreMappingResult, sanitizeRosterMappingResult, sanitizeStudentCommentResult, sanitizeCommentRefinementResult, toAssistantText, trimStudentFollowupPayload, trimAssistantContext } from "../worker-ai-payload.js";

const ASSISTANT_MAX_BODY_BYTES = 96 * 1024;

const SCORE_MAPPING_MAX_BODY_BYTES = 120 * 1024;

const MODEL = "deepseek-v4-flash";

async function handleAnalyzeTrend(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidTrendPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎的教师助手。只根据提供的匿名成绩摘要生成温和、可参考的趋势建议，不做绝对判断。recentExams 包含当前学期该学生全部考试，按考试先后从早到晚排列，最后一项是最新考试。进步、退步和持平只按班级排名判断，名次数值越小越好；总分与各科分数只能作为变化背景，排名缺失时不得用分数替代判断。必须返回 JSON，字段为 overall、changes、suggestions、disclaimer。所有字段值必须使用面向中国教师的自然中文，禁止在字段值中输出 totalScore、classRank、subjects、score 等 JSON 输入字段名或其他英文指标名。"
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseModelJson(content);
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeAiResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleAnalyzeClass(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidClassPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎的班主任成绩分析助手。只根据提供的全班成绩变化摘要、考试统计和重点候选学生序列，概括班级趋势，并指出需要教师重点关注的学生。学生进步、退步和持平只按班级排名判断，名次数值越小越好；总分与各科分数仅作背景，排名缺失时不得用分数替代判断。不要声称看到了完整全班逐科明细。必须返回 JSON，字段为 overall、classChanges、focusStudents、suggestions、disclaimer。所有字段值必须使用面向中国教师的自然中文，禁止输出 totalScore、classRank、subjects、score 等 JSON 输入字段名或其他英文指标名。focusStudents 必须逐行列出，格式为“姓名（简短原因）”，原因控制在 12 个字以内。"
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseModelJson(content);
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeClassAiResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleChatAssistant(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, ASSISTANT_MAX_BODY_BYTES);
  if (!body.ok || !isValidAssistantPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎、务实的班主任 AI 助手。默认只能根据用户提供的当前班级、当前学期摘要回答；若提供 comparisonContext，可基于其中显式选择的同一班级对比学期做跨学期回答。不能声称看到了未提供的其他班级、其他学期或完整本地数据库。不要编造学生事实、成绩、家庭情况、心理/医学判断。不要输出会自动修改系统数据的指令。baseContext 是全班基础摘要；contextPacks 是本次问题自动附带的相关学生、考试、宿舍、标签、记录或班费明细；comparisonContext 是同班级跨学期摘要或不支持提示。若用户询问具体对象，优先使用 contextPacks 和 comparisonContext；只有确实没有相关明细时才说明信息不足。可以给老师提供班级分析、跨学期变化、重点学生跟进、沟通话术、评语素材方向、班费收支概览和下一步行动建议。必须返回 JSON，字段为 message、disclaimer、suggestedPrompts。message 用中文，结构清晰但不要太长；不要使用 Markdown 标记，不要输出 **粗体**、# 标题、代码块、反引号或表格，用普通中文、编号和自然换行即可；suggestedPrompts 给 2 到 4 个后续可问的问题。"
          },
          {
            role: "user",
            content: JSON.stringify({
              context: trimAssistantContext(body.value.context),
              messages: body.value.messages.map((message) => ({
                role: message.role,
                content: toAssistantText(message.content, 1200)
              }))
            })
          }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeAssistantResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleSuggestScoreMapping(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, SCORE_MAPPING_MAX_BODY_BYTES);
  if (!body.ok || !isValidScoreMappingPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是成绩表列映射助手。根据表头和少量样例，返回 JSON。列索引必须使用用户提供的 index，无法判断填 -1。字段：nameCol、subjectMappings、totalMapping、note。subjectMappings 数组元素字段：subject、scoreCol、rawScoreCol、assignedScoreCol、rankClassCol、rankSchoolCol；totalMapping 使用相同的分数与排名字段。scoreCol 表示未注明类型的成绩，rawScoreCol 表示原始分或卷面分，assignedScoreCol 表示赋分、等级分或转换分。只使用 knownSubjects 中的科目，不要编造不存在的列。"
          },
          { role: "user", content: JSON.stringify(body.value) }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeScoreMappingResult(parsed, body.value), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleSuggestRosterMapping(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, SCORE_MAPPING_MAX_BODY_BYTES);
  if (!body.ok || !isValidRosterMappingPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是班级名单表列映射助手。根据表头和少量样例，返回 JSON。列索引必须使用用户提供的 index，无法判断填 -1。字段：nameCol、studentNoCol、genderCol、rowCol、colCol、hasHeader、note。姓名列必须尽量识别；座位行列可选。不要编造不存在的列。"
          },
          { role: "user", content: JSON.stringify(body.value) }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeRosterMappingResult(parsed, body.value), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleStudentFollowup(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, MAX_BODY_BYTES + 8 * 1024);
  if (!body.ok || !isValidStudentFollowupPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎、务实的班主任学生跟进助手。只能根据用户提供的单个学生成绩、标签、日常记录、宿舍、座位和评语素材生成建议，不能编造家庭情况、心理/医学判断或未提供事实。输出要帮助老师马上行动：近期变化、风险信号、可表扬点、3条跟进动作、家校沟通草稿、可放入期末评语的素材。语言温和具体。必须返回 JSON，字段为 summary、riskSignals、strengths、actions、parentMessageDraft、commentMaterials、disclaimer。riskSignals、strengths、actions、commentMaterials 都必须是字符串数组；actions 恰好 3 条；如果资料不足，要在 riskSignals 或 actions 中提示需要补充的信息，而不是编造。"
          },
          {
            role: "user",
            content: JSON.stringify(trimStudentFollowupPayload(body.value))
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeStudentFollowupResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleGenerateWeeklyDraft(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, MAX_BODY_BYTES + 8 * 1024);
  if (!body.ok || !isValidWeeklyDraftPayload(body.value)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, stream: false, messages: [
        { role: "system", content: "你是谨慎的班主任周报与家校沟通助手。只能使用输入 facts 和 localDraft 中已有事实，不能推断家庭、心理或医学情况。班级周报要简洁可执行；个人沟通稿要客观、温和，不贴标签。必须返回 JSON：title、content、highlights、cautions、disclaimer，其中 highlights 和 cautions 是字符串数组。" },
        { role: "user", content: JSON.stringify(body.value) },
      ] }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    return parsed ? jsonResponse(sanitizeWeeklyDraftResult(parsed), 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleAnalyzeScoreItems(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, MAX_BODY_BYTES + 12 * 1024);
  if (!body.ok || !isValidScoreItemPayload(body.value)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, stream: false, messages: [
        { role: "system", content: "你是中小学考试题目分析助手。只根据已计算的题目得分率、知识点和匿名学生 ID 提供教学判断，不编造题干或知识点。必须返回 JSON：overview、weakPoints、teachingSuggestions、followupCandidates、disclaimer。followupCandidates 每项只含 studentId 和 reason，最多 12 人。" },
        { role: "user", content: JSON.stringify(body.value) },
      ] }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    return parsed ? jsonResponse(sanitizeScoreItemResult(parsed, body.value), 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleGenerateStudentComment(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request);
  if (!body.ok || !isValidStudentCommentPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

  const missingInfo = getStudentCommentMissingInfo(body.value.context);
  if (missingInfo.length >= 3 && !toText(body.value.context.teacherNote)) {
    return jsonResponse({ comment: "", needsMoreInfo: true, missingInfo }, 200, corsHeaders);
  }
  const commentLength = getStudentCommentLengthSettings(body.value);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              `你是谨慎的班主任评语助手。只根据用户提供的单个学生信息、当前学期全部成绩序列、标签、日常记录、评语工作台素材 commentProfile 和教师补充评价写期末评语。禁止编造未提供事实，禁止夸大或做医学/心理诊断。语言自然，不模板化，适合作为期末评语，兼具鼓励和建设性提醒。优先使用老师选择的评语素材和教师补充评价；成绩事实只能来自上下文。可以综合标准选择和自定义素材，但不要机械罗列所有选项。必须返回 JSON，字段为 comment、needsMoreInfo、missingInfo。comment 必须是中文，目标长度为${commentLength.instruction}。若信息不足，needsMoreInfo 为 true，missingInfo 说明需要补充哪些信息，comment 可以为空。`
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeStudentCommentResult(parsed, missingInfo, commentLength), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleRefineStudentComment(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok || !isValidCommentRefinementPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  const instructions = {
    polish: "让表达更自然、准确、温和，保持原意和事实不变。",
    specific: "只依据原文和相邻语境把动作或表现说得更清楚；没有事实支撑时不得新增例子、成绩或判断。",
    shorten: "删除重复和空泛表达，用更短的文字保留全部事实与原意。",
  };

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content: `你是谨慎的班主任评语文字编辑。只改写 selectedText，不改写相邻语境，不添加输入中没有的学生事实，不做心理或医学判断。${instructions[body.value.action]}返回 JSON，唯一字段为 replacement；replacement 只放替换文字，不加引号、说明或 Markdown。`,
          },
          { role: "user", content: JSON.stringify(body.value) },
        ],
      }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    const replacement = sanitizeCommentRefinementResult(parsed);
    return replacement ? jsonResponse({ replacement }, 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

export const aiPostRoutes = {
  "/auth": handleAuth,
  "/analyze-trend": handleAnalyzeTrend,
  "/analyze-class": handleAnalyzeClass,
  "/chat-assistant": handleChatAssistant,
  "/student-followup": handleStudentFollowup,
  "/generate-comment": handleGenerateStudentComment,
  "/refine-comment": handleRefineStudentComment,
  "/suggest-score-mapping": handleSuggestScoreMapping,
  "/suggest-roster-mapping": handleSuggestRosterMapping,
  "/generate-weekly-draft": handleGenerateWeeklyDraft,
  "/analyze-score-items": handleAnalyzeScoreItems,
};
