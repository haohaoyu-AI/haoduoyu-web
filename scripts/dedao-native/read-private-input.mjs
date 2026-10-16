export function readPrivateJsonLine({input = process.stdin, output = process.stdout, maximum = 20000} = {}) {
  return new Promise((resolve, reject) => {
    let raw = '', finished = false, rawEnabled = false;
    const tty = Boolean(input.isTTY);
    const cleanup = () => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.removeListener('error', onError);
      if (rawEnabled) input.setRawMode(false);
      input.pause();
    };
    const finish = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error); else {
        try { resolve(JSON.parse(raw)); } catch { reject(Error('Private registration input is not JSON')); }
      }
      raw = '';
    };
    const onData = chunk => {
      const text = String(chunk);
      if (text.includes('\u0003')) return finish(Error('Private registration cancelled'));
      const newline = text.search(/[\r\n]/);
      raw += newline < 0 ? text : text.slice(0, newline);
      if (raw.length > maximum) return finish(Error('Private registration input is too large'));
      if (newline >= 0) finish();
    };
    const onEnd = () => finish();
    const onError = () => finish(Error('Private registration input is unavailable'));
    try {
      if (tty) {
        if (typeof input.setRawMode !== 'function') throw Error('Hidden terminal input is unavailable');
        // Disable terminal echo before announcing readiness for secret input.
        input.setRawMode(true);
        rawEnabled = true;
      }
      input.setEncoding('utf8');
      input.on('data', onData);
      input.on('end', onEnd);
      input.on('error', onError);
      output.write('Ready for private registration JSON on stdin (input is hidden)\n');
      input.resume();
    } catch { finish(Error('Hidden private registration input could not be prepared')); }
  });
}
