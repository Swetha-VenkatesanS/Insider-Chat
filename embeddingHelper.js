let embedder;

async function loadEmbedder() {
  if (!embedder) {
    const { pipeline } = await import('@xenova/transformers'); // ✅ dynamic import
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
}

async function generateEmbedding(text) {
  await loadEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

module.exports = {
  generateEmbedding,
};