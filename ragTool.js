const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');

// Language parsers
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript').typescript;
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const C = require('tree-sitter-c');
const Cpp = require('tree-sitter-cpp');
const CSharp = require('tree-sitter-c-sharp');

const { generateEmbedding } = require('./embeddingHelper');
const { upsertEmbeddings, queryEmbeddings } = require('./pineconeHelper');

const supportedExtensions = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
};

const languageMap = {
  javascript: JavaScript,
  typescript: TypeScript,
  python: Python,
  java: Java,
  c: C,
  cpp: Cpp,
  csharp: CSharp,
};

function getAllCodeFiles(dir, extensions = Object.keys(supportedExtensions), collected = []) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllCodeFiles(fullPath, extensions, collected);
    } else if (extensions.includes(path.extname(fullPath).toLowerCase())) {
      collected.push(fullPath);
    }
  }
  return collected;
}

function extractFunctionName(node, langId) {
  if (langId === 'python') {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || 'unknown_python_func';
  }

  if (['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp'].includes(langId)) {
    const identifier = node.descendantsOfType('identifier')[0];
    return identifier?.text || 'unknown_func';
  }

  return 'unknown_func';
}

function extractCodeSnippets(code, langId) {
  const parser = new Parser();
  parser.setLanguage(languageMap[langId]);
  const tree = parser.parse(code);
  const root = tree.rootNode;

  const functionNodes = root.descendantsOfType([
    'function_definition', // C
    'function_declaration', // JS, TS, Java
    'function', 'method', 'method_definition', 'class_definition', // Python, JS
  ]);

  return functionNodes.map((node, index) => {
    const snippet = code.slice(node.startIndex, node.endIndex);
    const token = extractFunctionName(node, langId);
    return {
      index,
      token,
      code: snippet,
    };
  });
}

async function indexProject(projectPath) {
  const codeFiles = getAllCodeFiles(projectPath);
  const allEmbeddings = [];

  for (const filePath of codeFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const langId = supportedExtensions[ext];
    if (!langId || !languageMap[langId]) {
      console.warn(`⚠️ Unsupported file skipped: ${filePath}`);
      continue;
    }

    const code = fs.readFileSync(filePath, 'utf8');
    const snippets = extractCodeSnippets(code, langId);

    console.log(`📄 Indexing: ${path.basename(filePath)} (${snippets.length} snippets)`);

    for (const { index, token, code: snippet } of snippets) {
      const embedding = await generateEmbedding(snippet);
      allEmbeddings.push({
        id: `${path.basename(filePath)}_${token}_${index}`,
        values: embedding,
        metadata: {
          filePath,
          filename: path.basename(filePath),
          language: langId,
          token,
          code: snippet,
        },
      });
    }
  }

  if (allEmbeddings.length > 0) {
    await upsertEmbeddings(allEmbeddings);
    console.log(`✅ Indexed ${allEmbeddings.length} function snippets.`);
  } else {
    console.log('⚠️ No function snippets found.');
  }
}

async function updateFileIndex(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const langId = supportedExtensions[ext];
  if (!langId || !fs.existsSync(filePath)) return;

  const code = fs.readFileSync(filePath, 'utf8');
  const snippets = extractCodeSnippets(code, langId);

  const embeddings = [];

  for (const { index, token, code: snippet } of snippets) {
    const emb = await generateEmbedding(snippet);
    embeddings.push({
      id: `${path.basename(filePath)}_${token}_${index}`,
      values: emb,
      metadata: {
        filePath,
        filename: path.basename(filePath),
        language: langId,
        token,
        code: snippet,
      },
    });
  }

  if (embeddings.length) {
    await upsertEmbeddings(embeddings);
    console.log(`📌 Re-indexed ${path.basename(filePath)} with ${embeddings.length} functions.`);
  }
}

async function searchFunctionLocation(userQuery) {
  const queryEmbedding = await generateEmbedding(userQuery);
  const resultObject = await queryEmbeddings(queryEmbedding);
  const matches = resultObject.internalLog?.matches || [];

  return matches.slice(0, 3).map((r) => ({
    file: r.metadata?.filename || 'Unknown file',
    token: r.metadata?.token || '[Unknown]',
    snippet: r.metadata?.code || '[No code]',
    score: r.score?.toFixed(3) || '0.000',
  }));
}

module.exports = {
  indexProject,
  updateFileIndex,
  searchFunctionLocation,
};
