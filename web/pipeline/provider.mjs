// 统一模型入口。默认 DeepSeek；把 AUTHEN_LLM_BASE_URL / AUTHEN_LLM_MODEL 指向
// 本地 vLLM 或 DashScope 的 Qwen3-VL，即可切到开源主脑，代码不用改。
// 约束：温度置零、强制 JSON、禁止输出概率；失败必须显式抛出，由上层记 EF。

export class LLMError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function baseConfig() {
  const base = (process.env.AUTHEN_LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.AUTHEN_LLM_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const provider = process.env.AUTHEN_LLM_PROVIDER || 'deepseek';
  return { base, model, provider };
}

export function createLLM({ key, fetchImpl = fetch, signal, timeoutMs = 55000 } = {}) {
  const { base, model, provider } = baseConfig();
  return {
    provider, model,
    vision: /vl|vision|deepseek-chat|deepseek-flash/i.test(model) || provider !== 'deepseek',
    async chatJSON(system, userContent, { maxTokens = 1800 } = {}) {
      const messages = [{ role: 'system', content: system }, { role: 'user', content: userContent }];
      let response;
      try {
        response = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            top_p: 1,
            max_tokens: maxTokens,
            stream: false,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
        });
      } catch {
        throw new LLMError(504, signal?.aborted ? '本次检查已取消。' : '模型连接超时。');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new LLMError(response.status, response.status === 429 ? '模型暂时繁忙。' : '模型服务暂不可用。');
      }
      try {
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error();
        const json = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        return JSON.parse(json);
      } catch {
        throw new LLMError(502, '模型返回内容不完整。');
      }
    },
  };
}
