const fs = require('fs');
const path = require('path');

/**
 * Utility to read and parse a JSON file from the extension root.
 * @param {string} fileName - Name of the JSON file to load.
 * @returns {object} - Parsed JSON content.
 */
function loadJson(fileName) {
  const filePath = path.join(__dirname, fileName);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error loading ${fileName}:`, err);
    return null;
  }
}

// Load system prompt and tools config
const systemPrompt = loadJson('system-prompt.json');
const toolsConfig = loadJson('tools-description.json');

/**
 * Returns the full raw system prompt config.
 * @returns {object|null}
 */
function getSystemPrompt() {
  return systemPrompt || {};
}

/**
 * Returns an array of all defined tool objects.
 * @returns {Array<object>}
 */
function getAllTools() {
  return toolsConfig?.tools || [];
}

/**
 * Finds a specific tool by its name.
 * @param {string} toolName - The name of the tool (e.g., "fixCodeError")
 * @returns {object|null}
 */
function getToolByName(toolName) {
  return getAllTools().find((tool) => tool.tool_name === toolName) || null;
}

/**
 * Returns a minimal list of tool names (e.g., for autocomplete or listing).
 * @returns {string[]}
 */
function getToolNames() {
  return getAllTools().map((tool) => tool.tool_name);
}

function extractKeywords(text) {
  if (typeof text !== 'string') return []; // ✅ Safe check
  return text
    .toLowerCase()
    .match(/\b\w+\b/g)
    ?.filter((word) => word.length > 3) || [];
}



function getToolDescription() {
  const tools = getAllTools(); // instead of parsing file again
  return tools.map(tool => ({
    name: tool.tool_name, // Match what detectToolIntent returns
    keywords: tool.keywords || []
  }));
}
async function callGemini(query, systemPrompt) {
  try {
    const body = {
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\nUser: ${query}` }
          ]
        }
      ]
    };

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyDn0Cz4BI9pBE7sqvS_y3Pe9Do4j-bXe68',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    const data = await res.json();

    // @ts-ignore
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
           '⚠️ No valid response from Gemini.';
  } catch (err) {
    console.error('❌ Gemini error:', err);
    return '❌ Failed to connect to Gemini.';
  }
}



// 🔍 DeepSeek API Call (replace with actual if needed)
async function callDeepSeek(query, systemPrompt) {
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-r1:7b',
        prompt: `${systemPrompt}\n\nUser: ${query}`,
        stream: false
      })
    });

    /** @type {any} */
    const data = await res.json();

    console.log('📨 DeepSeek raw response:', JSON.stringify(data, null, 2));

    if (data && typeof data === 'object' && typeof data.response === 'string') {
      return data.response.trim();
    }

    return '⚠️ Model did not return a valid response.';
  } catch (err) {
    console.error('❌ DeepSeek error:', err);
    return '❌ Failed to connect to DeepSeek model.';
  }
}





async function callModelWithQuery(query, model, systemPrompt = '') {
  if (model === 'gemini') {
    // Gemini call
    return await callGemini(query, systemPrompt);
  } else {
    // DeepSeek or any fallback model
    return await callDeepSeek(query, systemPrompt);
  }
}



module.exports = {
  getSystemPrompt,
  getAllTools,
  getToolByName,
  getToolDescription,
  getToolNames,
  systemPrompt,
  callModelWithQuery,
  toolsConfig
};
