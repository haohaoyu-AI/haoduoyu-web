'use client';
import {useRef, useState} from 'react';
import Link from 'next/link';
export default function PreparedImport() {
 const lock = useRef(false), [busy, setBusy] = useState(false), [result, setResult] = useState('');
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (lock.current) return;
  const form = event.currentTarget, data = new FormData(form), file = data.get('file');
  if (!(file instanceof File) || !file.size || file.size > 40000) {setResult('请选择不超过40KB的定稿JSON。'); return;}
  lock.current = true; setBusy(true);
  try {
   const input = JSON.parse(await file.text());
   const response = await fetch('/api/articles/prepared', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Prepared-Import': '1'}, body: JSON.stringify({...input, confirm: data.get('confirm') === 'on'})});
   setResult(JSON.stringify(await response.json(), null, 2));
  } catch {setResult('导入状态未知，请先查看任务列表。不会自动重试。');}
  finally {lock.current = false; setBusy(false);}
 }
 return <main><h1>登记已确认的定稿</h1><p>仅保存原题和原文，供绑定已经制作好的配图Word。不会重新写文、搜图或投递平台。</p>
  <form onSubmit={submit}><label>定稿JSON文件<input name="file" type="file" accept="application/json,.json" required disabled={busy}/></label>
   <p>文件需包含 title、paragraphs、expected_original_sha256。校验值为标题与段落数组JSON的SHA256。</p>
   <label><input name="confirm" type="checkbox" required disabled={busy}/>确认这份正文已经定稿，按原文登记</label>
   <button type="submit" disabled={busy}>{busy ? '登记中…' : '登记定稿（不生成、不投递）'}</button>
  </form><pre role="status" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{result}</pre><Link href="/">返回任务列表</Link></main>;
}
