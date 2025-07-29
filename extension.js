const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const fetch = require('node-fetch');
const { detectToolIntent, executeTool } = require('./tools');
const { getSystemPrompt, callModelWithQuery } = require('./wrapper');
// @ts-ignore
const { indexProject, updateFileIndex } = require('./ragTool');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('🔌 Extension activated');

  const disposable = vscode.commands.registerCommand('swethasvinsiderchat.openChat', async () => {
    const panel = vscode.window.createWebviewPanel(
      'insiderChatPanel',
      '💬 Insider Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    function getWebviewHtml() {
      const htmlPath = path.join(context.extensionPath, 'webview.html');

      try {
        return fs.readFileSync(htmlPath, 'utf8');
      } catch (err) {
        console.error('❌ Failed to load chat.html:', err);
        return `<html><body><h1 style="color:red">Failed to load chat panel.</h1></body></html>`;
      }
    }

    panel.webview.html = getWebviewHtml(); // ✅ <-- loads actual UI

    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');

    panel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          if (message.type === 'query') {
            const { text: query, model } = message;
            console.log(`🟢 Query received: "${query}"`);
            console.log(`⚙️ Model selected: ${model}`);

            await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');

            const detectedTool = await detectToolIntent(query, model);
            if (detectedTool && detectedTool !== 'none') {
              console.log(`🛠️ Triggering tool: ${detectedTool}`);
              const toolResult = await executeTool(detectedTool, query, model);
              if (toolResult) {
                panel.webview.postMessage({
                  type: 'response',
                  text: toolResult.userVisibleMsg,
                  isComplete: true
                });
                return;
              }
            }

            await streamModelResponse(panel, query, model);
          }

          if (message.type === 'run-terminal-command') {
            const terminalName = 'InsiderChat-Terminal';
            let terminal = vscode.window.terminals.find(t => t.name === terminalName);

            if (!terminal) {
              terminal = vscode.window.createTerminal(terminalName);
            }

            terminal.show(true);
            terminal.sendText(message.command);
          }
        } catch (err) {
          console.error('❌ Error handling chat message:', err);
          panel.webview.postMessage({
            type: 'response',
            text: `❌ Internal error: ${err.message || err}`,
            isComplete: true
          });
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);

  // ✅ Index project on startup
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder) {
    setTimeout(() => {
      void vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'Indexing project for RAG tool...',
          cancellable: false,
        },
        async () => {
          try {
            await indexProject(folder);
            console.log('📚 RAG indexing complete.');
          } catch (err) {
            console.error('❌ Error indexing project:', err);
          }
        }
      );
    }, 3000);
  }

  // ✅ Watch file saves to re-index
  vscode.workspace.onDidSaveTextDocument(async (document) => {
    try {
      await updateFileIndex(document.fileName);
    } catch (err) {
      console.error('❌ Error updating file index:', err);
    }
  });
}

async function streamModelResponse(panel, query, model) {
  const systemPrompt = getSystemPrompt();

  try {
    if (model === 'deepseek') {
      await streamDeepSeek(panel, query, systemPrompt);
    } else if (model === 'gemini') {
      await streamGemini(panel, query, systemPrompt);
    }
  } catch (err) {
    console.error('❌ Streaming error:', err);
    panel.webview.postMessage({
      type: 'response',
      text: `❌ Streaming error: ${err.message || err}`,
      isComplete: true
    });
  }
}

async function streamDeepSeek(panel, query, systemPrompt) {
  const DEEPSEEK_URL = 'http://localhost:11434/api/generate';
  const MODEL_NAME = 'deepseek-r1:7b';

  const fullPrompt = `${systemPrompt}\n\nUser: ${query}\n\nAssistant:`;

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: fullPrompt,
        stream: true
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    let buffer = '', accumulatedText = '';
    panel.webview.postMessage({ type: 'stream_start', messageId: Date.now() });

    res.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              accumulatedText += data.response;
              panel.webview.postMessage({ type: 'stream_chunk', text: data.response, accumulatedText });
            }
            if (data.done) {
              panel.webview.postMessage({ type: 'stream_end', finalText: accumulatedText });
              return;
            }
          } catch (e) { console.error('Error parsing JSON:', e); }
        }
      }
    });

    res.body.on('end', () => {
      panel.webview.postMessage({ type: 'stream_end', finalText: accumulatedText });
    });

    res.body.on('error', (err) => {
      console.error('Stream error:', err);
      panel.webview.postMessage({ type: 'stream_error', error: err.message });
    });
  } catch (err) {
    console.error('❌ DeepSeek streaming error:', err);
    panel.webview.postMessage({
      type: 'response',
      text: `❌ Failed to connect to DeepSeek: ${err.message}`,
      isComplete: true
    });
  }
}

async function streamGemini(panel, query, systemPrompt) {
  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyDn0Cz4BI9pBE7sqvS_y3Pe9Do4j-bXe68';
  const fullPrompt = `${systemPrompt}\n\nUser: ${query}\n\nAssistant:`;
  const body = { contents: [{ parts: [{ text: fullPrompt }] }] };

  try {
    panel.webview.postMessage({ type: 'stream_start', messageId: Date.now() });
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '⚠️ No valid response from Gemini.';

    const words = fullText.split(' ');
    let accumulatedText = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      accumulatedText += word;
      panel.webview.postMessage({ type: 'stream_chunk', text: word, accumulatedText });
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    panel.webview.postMessage({ type: 'stream_end', finalText: accumulatedText });
  } catch (err) {
    console.error('❌ Gemini streaming error:', err);
    panel.webview.postMessage({
      type: 'response',
      text: `❌ Failed to connect to Gemini: ${err.message}`,
      isComplete: true
    });
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
