// pineconeHelper.js
require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');

const client = new Pinecone();
const index = client.Index(process.env.PINECONE_INDEX_NAME);

async function upsertEmbeddings(vectors) {
  await index.upsert(vectors);
}

async function queryEmbeddings(embedding) {
  const queryResult = await index.query({
    vector: embedding,
    topK: 3,
    includeMetadata: true,
  });

  const topMatches = queryResult.matches || [];

  if (topMatches.length === 0) {
    return {
      userVisibleMsg: '⚠️ No similar matches found.',
      internalLog: queryResult,
    };
  }

  let combinedResult = '🔎 Top function matches:\n';

  for (const match of topMatches) {
    const { metadata, score } = match;
    combinedResult += `\n📄 ${metadata?.filename || 'Unknown file'}\n\n`;
    combinedResult += `${metadata?.code || '[No code snippet]'}\n`;
    combinedResult += `Similarity: ${score.toFixed(3)}\n`;
  }

  return {
    userVisibleMsg: combinedResult,
    internalLog: queryResult,
  };
}


module.exports = {
  upsertEmbeddings,
  queryEmbeddings,
};
