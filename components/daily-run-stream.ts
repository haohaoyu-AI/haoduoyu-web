export type DailyStreamEvent = {
  type?: string;
  terminal?: boolean;
  success?: boolean;
  state?: string;
  error?: string;
  [key: string]: unknown;
};

export async function readDailyNdjson(body: ReadableStream<Uint8Array>, onEvent: (event: DailyStreamEvent) => void): Promise<DailyStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  const terminal = { value: null as DailyStreamEvent | null };

  const acceptLine = (line: string) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try { parsed = JSON.parse(line); }
    catch { throw new Error('长连接结果无法核验；请读取日更结果，不要重新调用'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('长连接结果格式无法核验；请读取日更结果，不要重新调用');
    const event = parsed as DailyStreamEvent;
    if (event.terminal === true && !terminal.value) terminal.value = event;
    onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        acceptLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) acceptLine(buffer);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('长连接结果')) throw error;
    throw new Error('连接中断或文本编码不完整；请读取日更结果，不要重新调用');
  } finally {
    reader.releaseLock();
  }

  const finalEvent = terminal.value as DailyStreamEvent | null;
  if (!finalEvent) throw new Error('连接结束但没有收到完整结果；请读取日更结果，不要重新调用');
  return finalEvent;
}
