/** Splits text into overlapping chunks along paragraph boundaries. */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length > size) {
      flush();
      const step = Math.max(1, size - overlap);
      for (let i = 0; i < para.length; i += step) {
        chunks.push(para.slice(i, i + size).trim());
        if (i + size >= para.length) break;
      }
    } else if (cur && (cur + '\n\n' + para).length > size) {
      flush();
      cur = para;
    } else {
      cur = cur ? cur + '\n\n' + para : para;
    }
  }
  flush();
  return chunks.filter(Boolean);
}
