'use client';

import { useRef, useState } from 'react';
import { readDailyNdjson } from '../../../components/daily-run-stream';
import {writingOutlineTemplate,writingOutlineHelp} from '../../../lib/writing-outline-template';

function todayInBeijing() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function responseError(response: Response) {
  if (response.status === 401) return '请使用本人 ChatGPT 账号登录';
  if (response.status === 403) return '当前账号暂无访问权限，请核对本人账号';
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* Hide non-JSON server bodies. */ }
  return typeof body.error === 'string' ? body.error : '日更资料未通过核验';
}

export default function DailyRun() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const lock = useRef(false);

  async function consume(response: Response) {
    if (!response.ok) throw new Error(await responseError(response));
    if (!response.body) throw new Error('没有收到长连接结果；请先读取日更结果再决定下一步');
    const finalEvent = await readDailyNdjson(response.body, event => {
      if (event.terminal === true) setFeedback(event.success ? (event.state || '文章已保存') : (event.error || '结果尚未确认；不会自动再次调用'));
      else if (event.type === 'running') setFeedback('日更正在处理，连接保持中…');
    });
    if (!finalEvent.success) throw new Error(finalEvent.error || '结果尚未确认；不会自动再次调用');
    return finalEvent;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback('正在提交已认领的日更…');
    const form = new FormData(event.currentTarget);
    try {
      let sources: unknown;
      try { sources = JSON.parse(String(form.get('sources') || '')); }
      catch { throw new Error('资料来源需为JSON数组'); }
      const response = await fetch('/api/claude/daily-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xiaoyu-daily-run': '1' },
        body: JSON.stringify({
          day: form.get('day'),
          article_id: form.get('article_id'),
          token: form.get('token'),
          expected_model: form.get('expected_model'),
          topic: form.get('topic'),
          materials: form.get('materials'),
          outline: form.get('outline') || undefined,
          sources,
        }),
      });
      await consume(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '结果尚未确认；请先读取日更结果，不要重新调用';
      setFeedback(message === 'Failed to fetch' || message === 'NetworkError when attempting to fetch resource.'
        ? '连接未能确认；请读取日更结果，不要重新调用'
        : message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="daily-run-page">
      <header className="site-header">
        <h1>Claude 日更</h1>
        <span className="edition">长连接入口</span>
      </header>
      <p className="daily-run-note">仅供已认领的北京时间日更使用。此页不会认领任务或自动重试；如连接中断，请先读取日更结果，再决定是否继续。</p>
      <form className="daily-run-form" onSubmit={submit} aria-busy={busy}>
        <label>日期（北京时间）<input name="day" type="date" defaultValue={todayInBeijing()} required disabled={busy} /></label>
        <label>文章认领编号<input name="article_id" type="text" inputMode="text" autoComplete="off" required disabled={busy} /></label>
        <label>认领 token<input name="token" type="password" autoComplete="off" required disabled={busy} /></label>
        <label>已配置模型<input name="expected_model" type="text" autoComplete="off" required disabled={busy} /></label>
        <label>选题<input name="topic" type="text" maxLength={300} required disabled={busy} /></label>
        <label>文章框架（新版本必填）<textarea name="outline" maxLength={8000} rows={16} placeholder={writingOutlineTemplate} /></label>
        <p className="daily-run-note">{writingOutlineHelp}</p>
        <label>已核验资料<textarea name="materials" minLength={100} maxLength={18000} rows={8} required disabled={busy} /></label>
        <label>资料来源（JSON数组）<textarea name="sources" rows={5} placeholder={'[{"title":"来源标题","url":"https://example.com/article","published":"2026-10-04"}]'} required disabled={busy} /></label>
        <button type="submit" disabled={busy}>{busy ? '处理中…' : '执行已认领日更'}</button>
        <p className="inline-feedback" role="status" aria-live="polite">{feedback}</p>
      </form>
    </main>
  );
}
