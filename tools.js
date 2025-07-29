const os = require('os');
const { execSync } = require('child_process');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { callGeminiWithPrompt } = require('./geminiWrapper');
const { callDeepSeekWithPrompt } = require('./deepseekWrapper');
const { searchFunctionLocation } = require('./ragTool'); // ✅ Add this


let systemPrompt = '';
try {
  systemPrompt = fs.readFileSync(path.join(__dirname, 'system-prompt.json'), 'utf-8');
} catch (err) {
  console.warn('⚠️ Could not load system-prompt.json:', err.message);
}

function getModelHandler(model) {
  if (model === 'deepseek') return callDeepSeekWithPrompt;
  return callGeminiWithPrompt; // default to gemini
}

function runCommandWithFullOutput(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch (err) {
    return err.stderr?.toString().trim() || err.message || '❌ Unknown error';
  }
}

async function getVersionCommandFromModel(tool, model) {
  const prompt = `In Windows Command Prompt, what is the exact command to check the version of "${tool}"? ONLY return the plain command like "python --version" or "java -version".`;
  const callModel = getModelHandler(model);
  let raw = await callModel(prompt);
  const match = raw?.match(/```(?:\w*\n)?([\s\S]*?)```/);
  if (match) raw = match[1].trim();
  raw = raw.replace(/^[`"'\\]+|[`"'\\]+$/g, '').trim();
  return raw;
}

function extractToolsFromQuery(query) {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean))];
}

async function getSystemInfoTool(queryText = '', model) {
  const nodeVersion = process.version;
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();

  const baseInfo = `Node.js: ${nodeVersion}\nSystem: ${platform} ${arch} (Release: ${release})`;
  const tools = extractToolsFromQuery(queryText);
  const results = [];

  for (const tool of tools) {
    const versionCmd = await getVersionCommandFromModel(tool, model);
    if (!versionCmd) {
      results.push(`${tool}: Model could not suggest a command.`);
      continue;
    }

    try {
      const output = runCommandWithFullOutput(versionCmd);
      results.push(`${tool}: ${output}`);
    } catch (err) {
      results.push(`${tool}: Failed to run command \`${versionCmd}\``);
    }
  }

  if (results.length === 0) {
    results.push('No valid tools or version commands detected.');
  }

  const finalOutput = `${baseInfo}\n\nVersions:\n${results.join('\n')}`;
  return {
    toolOutput: finalOutput,
    userVisibleMsg: `System Info:\n${finalOutput}`
  };
}

async function fixCodeTool(code, model) {
  const prompt = `Fix the following code by correcting any syntax or logical errors. Only return the corrected version of the full code:\n\n\`\`\`\n${code}\n\`\`\``;
  const callModel = getModelHandler(model);
  let fixedCode = await callModel(prompt);
  const match = fixedCode.match(/```(?:\w*\n)?([\s\S]+?)```/);
  if (match) fixedCode = match[1].trim();

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, fullRange, fixedCode);
    await vscode.workspace.applyEdit(edit);
    await editor.document.save();
  }

  return '✅ Code in the file has been corrected.';
}

async function runOpenFileTool(model) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return {
      toolOutput: '',
      userVisibleMsg: '❌ Please open a file before trying to run it.'
    };
  }

  const filePath = editor.document.fileName;
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const nameWithoutExt = path.basename(filePath, ext);
  const fileContent = editor.document.getText();

  const prompt = `You're an expert terminal assistant. Based on the extension and content of the given code file, return ONLY the PowerShell command(s) to run the file.

Respond in this format:
\`\`\`powershell
<commands>
\`\`\`

Rules:
- Do NOT include explanations or <think> tags.
- If needed, include compilation (e.g., javac) then execution (e.g., java HeapSort).
- Do NOT include any notes, assumptions, or reasoning.

Filename: ${fileName}
Extension: ${ext}
Content:
${fileContent}`;

  const callModel = getModelHandler(model);
  let commandRaw = await callModel(prompt);

  console.log('🧾 Raw model output:\n' + commandRaw);

  // Attempt to extract commands from code block
  // Remove <think> blocks or any extra explanations
commandRaw = commandRaw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

// Try to extract command from a code block
let match = commandRaw.match(/```(?:powershell|bash|sh)?\n?([\s\S]*?)```/);
let command = match ? match[1].trim() : '';

// Filter only valid terminal commands
command = command
  .split('\n')
  .map(line => line.trim())
  .filter(line =>
    line &&
    !line.startsWith('<') &&
    !line.toLowerCase().includes('note') &&
    line.match(/^(javac|java|python|node|dotnet|go|tsc|ruby|php|run|npm run|npx)/i)
  )
  .join(' ; ');

if (!command) {
  console.warn('⚠️ No valid command detected from model output.');
  command = 'echo ❌ Could not extract a valid command.';
}


  // Clean up junk from command lines
  command = command
    .split('\n')
    .map(line => line.trim())
    .map(line => line.replace(/^\$jvm:|^\$|C:\\path\\to\\.*?HeapSort\.class/, '')) // remove junk
    .filter(line =>
      line &&
      !line.toLowerCase().startsWith('<think') &&
      !line.toLowerCase().startsWith('</think') &&
      !line.toLowerCase().includes('note') &&
      line.match(/^(javac|java|python|node|dotnet|go|tsc|ruby|php|run|npm run|npx)/i)
    )
    .join(' ; ');

  if (!command) {
    console.warn('⚠️ No valid command detected from model output.');
    command = 'echo ❌ Could not extract a valid command.';
  }

  return {
    toolOutput: command,
    userVisibleMsg: `▶️ Click <button data-run="${command.replace(/"/g, '&quot;')}">here</button> to run the file.`
  };
}





async function createFileFromQueryTool(query, model, streamToWebview = console.log) {
  const prompt = `You are a helpful assistant. A user asked: "${query}"
1. Determine the language (e.g., Python, JavaScript, C++).
2. Determine what logic to implement (e.g., Radix Sort).
3. Generate a filename that reflects the logic (e.g., radix_sort.js).
4. Output the full code for the logic. Do not explain. Respond in this exact format:

FILENAME: <filename>
\`\`\`<language>
<full code>
\`\`\``;

  const callModel = getModelHandler(model);
  const response = await callModel(prompt);

  console.log('📄 Raw model response for createFile:\n' + response);

  let filename = null;
  let code = null;

  // ✅ Try strict match first
  const match = response.match(/FILENAME:\s*(.+)\n```(?:\w+)?\n([\s\S]+?)```/);
  if (match) {
    filename = match[1].trim();
    code = match[2].trim();
  } else {
    // ❗ Fallback if DeepSeek doesn't follow format
    const filenameMatch = query.match(/(?:create file for|create)\s+(.+?)\s+(in|with)/i);
    const inferredName = filenameMatch ? filenameMatch[1].replace(/\s+/g, '_') : 'output';
    filename = inferredName + '.js';

    const fallbackCodeMatch = response.match(/```(?:\w+)?\n([\s\S]+?)```/);
    code = fallbackCodeMatch ? fallbackCodeMatch[1].trim() : null;
  }

  if (!filename || !code) {
    streamToWebview("❌ I couldn’t understand the file format or code.");
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    streamToWebview("❌ No open folder in VS Code.");
    return;
  }

  const folderPath = workspaceFolders[0].uri.fsPath;
  const filePath = path.join(folderPath, filename);
  const fileUri = vscode.Uri.file(filePath);

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(code, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);

  streamToWebview(`✅ Created \`${filename}\` with your logic.`);
}

// Improved tool detection with better pattern matching
function detectToolIntentByKeywords(queryText) {
  const query = queryText.toLowerCase();
  
  // System info patterns
  const systemInfoKeywords = [
    'version', 'node version', 'java version', 'python version', 'npm version',
    'system info', 'platform', 'what version', 'check version', 'installed version',
    'system', 'environment', 'runtime', 'sdk version', 'compiler version'
  ];
  
  // File creation patterns
  const createFileKeywords = [
    'create', 'write', 'generate', 'make', 'build', 'implement',
    'create file', 'write file', 'generate code', 'make a file',
    'create a', 'write a', 'generate a', 'implement a', 'build a'
  ];
  
  // Run file patterns
  const runFileKeywords = [
    'run', 'execute', 'start', 'launch', 'run file', 'execute file',
    'run this', 'execute this', 'start this', 'launch this',
    'run the file', 'execute the file', 'how to run', 'how to execute'
  ];
  
  // Fix code patterns
  const fixCodeKeywords = [
    'fix', 'error', 'bug', 'issue', 'problem', 'broken', 'not working',
    'fix code', 'fix this', 'debug', 'correct', 'repair', 'solve',
    'syntax error', 'runtime error', 'compilation error'
  ];
    // RAG pattern for function lookup
  const ragPatterns = [
    'where is', 'which file has', 'find function', 'where can i find',
    'locate function', 'which file contains', 'function location', 'in which file is'
  ];
  if (ragPatterns.some(p => query.includes(p))) {
    return 'searchFunctionLocation';
  }

  
  // Check for system info
  if (systemInfoKeywords.some(keyword => query.includes(keyword))) {
    return 'getSystemInfo';
  }
  
  // Check for create file (more specific patterns)
  if (createFileKeywords.some(keyword => query.includes(keyword))) {
    // Look for programming-related terms to confirm
    const programmingTerms = ['function', 'class', 'algorithm', 'sort', 'search', 'program', 'script', 'code'];
    if (programmingTerms.some(term => query.includes(term))) {
      return 'createFile';
    }
  }
  
  // Check for run file
  if (runFileKeywords.some(keyword => query.includes(keyword))) {
    return 'runOpenFile';
  }
  
  // Check for fix code
  if (fixCodeKeywords.some(keyword => query.includes(keyword))) {
    return 'fixCodeError';
  }
  
  return null;
}

async function detectToolIntent(queryText, model) {
  // First, try keyword-based detection (faster and more reliable)
  const keywordResult = detectToolIntentByKeywords(queryText);
  if (keywordResult) {
    console.log(`🎯 Tool detected by keywords: ${keywordResult}`);
    return keywordResult;
  }
  
  // Fallback to AI-based detection with improved prompt
  const prompt = `Analyze this user query and determine if it needs a specific tool. Query: "${queryText}"

Choose EXACTLY ONE from these options:
1. "getSystemInfo" - if asking about versions, system info, platform, or environment
2. "createFile" - if asking to create, write, generate, or implement new code/files
3. "runOpenFile" - if asking to run, execute, or start a currently open file
4. "fixCodeError" - if reporting errors, bugs, or asking to fix existing code
5. "none" - if it's a general question or doesn't need tools

Response format: Just return the tool name or "none". No explanation.`;

  const callModel = getModelHandler(model);
  
  try {
    const raw = await callModel(prompt);
    console.log(`🤖 AI raw response for tool detection: "${raw}"`);
    
    // Clean up the response
    const cleanResponse = raw
  .toLowerCase()
  .trim()
  .replace(/^["'`]+|["'`]+$/g, '')
  .replace(/\n.*$/s, '')
  .replace(/[^a-z]/g, '');

    
    console.log(`🧹 Cleaned AI response: "${cleanResponse}"`);
    
    // Map possible variations to actual tool names
  const toolMapping = {
  'getsysteminfo': 'getSystemInfo',
  'systeminfo': 'getSystemInfo',
  'createfile': 'createFile',
  'thecorrecttooliscreatefile': 'createFile',
  'runopenfile': 'runOpenFile',
  'runfile': 'runOpenFile',
  'runopenfiletool': 'runOpenFile',
  'fixcodeerror': 'fixCodeError',
  'fixcode': 'fixCodeError',
  'none': null
};

    
    const detectedTool = toolMapping[cleanResponse] || null;
    console.log(`🔍 Final detected tool: ${detectedTool}`);
    
    return detectedTool;
  } catch (err) {
    console.error('❌ Error in AI tool detection:', err);
    return null;
  }
}

async function executeTool(toolName, queryText, model) {
  console.log(`🛠️ Executing tool: ${toolName} with query: "${queryText}"`);
  
  if (toolName === 'getSystemInfo') {
    return await getSystemInfoTool(queryText, model);
  } else if (toolName === 'createFile') {
    return await createFileFromQueryTool(queryText, model);
  } else if (toolName === 'fixCodeError') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return {
        toolOutput: '',
        userVisibleMsg: '❌ Please open a code file to fix.'
      };
    }
    const code = editor.document.getText();
    const fixed = await fixCodeTool(code, model);
    return {
      toolOutput: fixed,
      userVisibleMsg: fixed
    };
  } else if (toolName === 'runOpenFile') {
    return await runOpenFileTool(model);
  } 
   else if (toolName === 'searchFunctionLocation') {
  const results = await searchFunctionLocation(queryText);
  return {
    toolOutput: results,
    userVisibleMsg: `🔎 Function matches found:\n\n${results.map(r => `📄 ${r.file}\n\`\`\`\n${r.snippet}\n\`\`\`\nSimilarity: ${r.score}`).join('\n\n')}`
  };
}
else {
    return {
      toolOutput: '',
      userVisibleMsg: `❌ Unknown tool: ${toolName}`
    };
  }
}

module.exports = {
  getSystemInfoTool,
  fixCodeTool,
  executeTool,
  runOpenFileTool,
  detectToolIntent,
  createFileFromQueryTool,
  systemPrompt
};