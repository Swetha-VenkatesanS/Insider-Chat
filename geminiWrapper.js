const fetch = require('node-fetch');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyDn0Cz4BI9pBE7sqvS_y3Pe9Do4j-bXe68';

/**
 * Call Gemini with simulated streaming support
 * Note: Gemini doesn't support true streaming, so we simulate it
 * @param {Array} messages - The messages to send
 * @param {Function} onChunk - Callback for each chunk of response
 * @param {Function} onComplete - Callback when streaming is complete
 * @param {Function} onError - Callback for errors
 */
async function callGeminiWithStreaming(messages, onChunk, onComplete, onError) {
  const body = { contents: messages };

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    console.log('🔍 Gemini raw response (streaming):', JSON.stringify(data, null, 2));

    const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!fullText) {
      onError('⚠️ No valid text content returned by Gemini.');
      return;
    }

    // Simulate streaming word-by-word
    const words = fullText.split(' ');
    let accumulatedText = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      accumulatedText += word;
      onChunk(word, accumulatedText);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    onComplete(accumulatedText);
  } catch (err) {
    console.error('❌ Gemini error (streaming):', err);
    onError(err.message || '❌ Streaming call failed.');
  }
}

/**
 * Call Gemini with streaming support using a prompt
 * @param {string} prompt - The prompt to send
 * @param {Function} onChunk - Callback for each chunk of response
 * @param {Function} onComplete - Callback when streaming is complete
 * @param {Function} onError - Callback for errors
 */
async function callGeminiWithPromptStreaming(prompt, onChunk, onComplete, onError) {
  return await callGeminiWithStreaming([{ parts: [{ text: prompt }] }], onChunk, onComplete, onError);
}

/**
 * Non-streaming: Call Gemini with structured message input
 */
async function callGeminiWithMessages(messages) {
  const body = { contents: messages };

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    console.log('🔍 Gemini raw response (non-streaming):', JSON.stringify(data, null, 2));

    const output = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return output || '⚠️ Gemini replied but gave no usable text.';
  } catch (err) {
    console.error('❌ Gemini error (non-streaming):', err);
    return '❌ Failed to connect to Gemini API.';
  }
}

/**
 * Call Gemini with a plain text prompt
 */
async function callGeminiWithPrompt(prompt) {
  return await callGeminiWithMessages([{ parts: [{ text: prompt }] }]);
}

module.exports = {
  callGeminiWithPrompt,
  callGeminiWithMessages,
  callGeminiWithStreaming,
  callGeminiWithPromptStreaming
};
