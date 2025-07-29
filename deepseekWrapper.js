const fetch = require('node-fetch');

const DEEPSEEK_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'deepseek-r1:7b';

/**
 * Call DeepSeek with streaming support
 * @param {string} prompt
 * @param {Function} onChunk
 * @param {Function} onComplete
 * @param {Function} onError
 */
async function callDeepSeekWithStreaming(prompt, onChunk, onComplete, onError) {
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt,
        stream: true
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    let buffer = '';
    let accumulatedText = '';

    res.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            accumulatedText += data.response;
            onChunk(data.response, accumulatedText);
          }
          if (data.done) {
            onComplete(accumulatedText);
            return;
          }
        } catch (err) {
          console.error('❌ Failed to parse DeepSeek JSON chunk:', line, err);
        }
      }
    });

    res.body.on('end', () => {
      onComplete(accumulatedText);
    });

    res.body.on('error', (err) => {
      onError(err);
    });

  } catch (err) {
    console.error('❌ Streaming error (DeepSeek):', err);
    onError(err);
  }
}

/**
 * Non-streaming fallback version
 */
async function callDeepSeekWithPrompt(prompt) {
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt,
        stream: false
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data?.response?.trim() || '⚠️ Model did not return a valid response.';
  } catch (err) {
    console.error('❌ DeepSeek error:', err);
    return '❌ Failed to connect to DeepSeek model.';
  }
}

module.exports = {
  callDeepSeekWithPrompt,
  callDeepSeekWithStreaming
};
