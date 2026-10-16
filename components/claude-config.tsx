'use client';

import { useEffect, useRef, useState } from 'react';

type ClaudeStatus = {
  configured?: boolean;
  enabled?: boolean;
  model?: string;
  base_url?: string;
  storage_ready?: boolean;
  max_output_tokens?: number;
  max_requests_per_day?: number;
};

async function readResponse<T>(response: Response, fallback: string, validate: (body: Record<string, unknown>) => boolean): Promise<T> {
  if (response.status === 401) throw new Error('请使用本人 ChatGPT 账号登录');
  if (response.status === 403) throw new Error('当前账号暂无访问权限，请核对本人账号');
  const raw = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* Non-JSON error bodies use the friendly fallback. */ }
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    const safe = message && !/\n\s*at\s|\bBearer\s|-----BEGIN|SQLITE_|D1_ERROR/i.test(message)
      ? message.slice(0, 500)
      : fallback;
    throw new Error(safe);
  }
  if (!body || !validate(body)) throw new Error(fallback);
  return body as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ClaudeConfig() {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const response = await fetch('/api/claude', { cache: 'no-store' });
        const data = await readResponse<ClaudeStatus>(response, '暂时无法读取配置', body =>
          typeof body.configured === 'boolean' && typeof body.enabled === 'boolean' && typeof body.model === 'string' && typeof body.storage_ready === 'boolean'
        );
        if (active) {
          setStatus(data);
          setModel(data.model || '');
          setModels(data.model ? [data.model] : []);
          setEnabled(Boolean(data.enabled));
          setStatusError('');
        }
      } catch (error: unknown) {
        if (active) setStatusError(errorMessage(error, '暂时无法读取配置'));
      } finally {
        if (active) setStatusLoading(false);
      }
    }
    void loadStatus();
    return () => { active = false; };
  }, []);

  async function loadModels() {
    if (lock.current) return;
    lock.current = true;
    setBusy('models');
    setMessage('正在读取模型目录…');
    try {
      const response = await fetch('/api/claude/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xiaoyu-config': '1' },
        body: JSON.stringify({ api_key: secret }),
      });
      const data = await readResponse<{ models: string[] }>(response, '暂时无法读取模型目录', body => Array.isArray(body.models) && body.models.every(modelId => typeof modelId === 'string'));
      const available = data.models;
      setModels(available);
      setModelsLoaded(true);
      setModel(old => available.includes(old) ? old : (available[0] || ''));
      setConsent(false);
      setMessage(available.length ? `已读取 ${available.length} 个 Claude 模型` : '这个密钥没有可用的 Claude 模型，请检查中转站分组');
    } catch (error: unknown) {
      setMessage(errorMessage(error, '暂时无法读取模型目录'));
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy('save');
    setMessage('正在保存配置…');
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xiaoyu-config': '1' },
        body: JSON.stringify({ model, api_key: secret, enabled, consent }),
      });
      const data = await readResponse<ClaudeStatus>(response, '配置未保存', body =>
        typeof body.configured === 'boolean' && typeof body.enabled === 'boolean' && typeof body.model === 'string' && typeof body.storage_ready === 'boolean'
      );
      setStatus(data);
      setSecret('');
      setConsent(false);
      setMessage(data.enabled ? '已启用每日 Claude 写作；首次正式调用后确认连通性' : '配置已保存，自动调用未启用');
    } catch (error: unknown) {
      setMessage(errorMessage(error, '配置未保存'));
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  async function testConnection() {
    if (lock.current) return;
    lock.current = true;
    setBusy('test');
    setMessage('正在测试，最多 32 个输出 tokens…');
    try {
      const response = await fetch('/api/claude/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xiaoyu-config': '1' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await readResponse<{ state: string; complete?: boolean; response_text?: string; error?: string }>(response, '测试结果待核实，请勿重复点击', body =>
        typeof body.state === 'string' && ['completed', 'failed', 'requested'].includes(body.state)
      );
      setMessage(data.state === 'completed'
        ? (data.complete ? `模型已回应：${data.response_text || ''}` : '模型有回应，但返回不完整')
        : (data.error || '测试结果待核实，不会自动重试'));
    } catch (error: unknown) {
      setMessage(errorMessage(error, '测试结果待核实，请勿重复点击'));
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  const configurationLabel = statusLoading
    ? '读取中'
    : statusError
      ? '暂时无法读取'
      : status?.enabled
        ? '已启用'
        : status?.configured
          ? '已配置'
          : '待配置';
  const maxOutputTokens = typeof status?.max_output_tokens === 'number' && Number.isFinite(status.max_output_tokens)
    ? status.max_output_tokens
    : 7000;
  const maxRequestsPerDay = typeof status?.max_requests_per_day === 'number' && Number.isFinite(status.max_requests_per_day)
    ? status.max_requests_per_day
    : 1;

  return (
    <details className="claude-config" aria-busy={!!busy || statusLoading}>
      <summary>
        <span>Claude 接入</span>
        <span className="config-status">{configurationLabel}</span>
      </summary>
      <div className="config-fields">
        <div className="model-picker">
          <label htmlFor="claude-model">模型
            <select
              id="claude-model"
              value={model}
              onChange={event => { setModel(event.target.value); setConsent(false); }}
              disabled={!!busy || !status || !models.length}
            >
              <option value="" disabled>请先读取模型列表</option>
              {models.map(id => <option key={id} value={id}>{id}{!modelsLoaded ? '（已保存）' : ''}</option>)}
            </select>
          </label>
          <button className="secondary" type="button" onClick={loadModels} disabled={!!busy || !status || (!secret && !status.configured)}>
            {busy === 'models' ? '读取中…' : '读取模型'}
          </button>
        </div>

        <label htmlFor="claude-key">API Key
          <input
            id="claude-key"
            type="password"
            value={secret}
            onChange={event => {
              setSecret(event.target.value);
              setModels([]);
              setModelsLoaded(false);
              setModel('');
              setConsent(false);
            }}
            placeholder={status?.configured ? '已保存；留空使用现有密钥' : '填写 YYLX 密钥'}
            autoComplete="new-password"
            disabled={!!busy || !status}
          />
        </label>

        <label htmlFor="claude-endpoint">接口地址
          <input id="claude-endpoint" className="readonly-input" readOnly value={status?.base_url || 'https://app.yylx.io'} />
        </label>

        <label className="check">
          <input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setConsent(false); }} disabled={!!busy || !status} />
          每天 8 点让 Claude 另写一篇
        </label>

        <p className="config-note">
          密钥加密保存在本网站后台。用于写作的公开素材和文风要求会发送到 YYLX 中转站。正式写作费用从你的中转站额度扣除，每天最多 {maxRequestsPerDay} 次；授权的测试单独计算，不自动重试。每次正式写作最多 {maxOutputTokens} 个输出 tokens。请在中转站设置消费限额。
        </p>
        <p className="config-note">连接测试也会消耗少量额度，最多使用 32 个输出 tokens。</p>
        <a className="action-link" href="https://app.yylx.io/model-plaza" target="_blank" rel="noreferrer">查看模型与价格</a>

        {statusError && <p className="error" role="alert">{statusError}</p>}
        {message && <p className="inline-feedback" role="status" aria-live="polite">{message}</p>}

        <label className="check consent-check">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!!busy || !status} />
          确认保存密钥及上述调用设置
        </label>
        <div className="config-actions">
          <button type="button" onClick={save} disabled={!!busy || !consent || !model || !status?.storage_ready}>
            {busy === 'save' ? '保存中…' : '保存配置'}
          </button>
          <button className="secondary" type="button" onClick={testConnection} disabled={!!busy || !status?.enabled || !!secret || model !== status?.model}>
            {busy === 'test' ? '测试中…' : '测试连接（少量额度）'}
          </button>
        </div>
      </div>
    </details>
  );
}
