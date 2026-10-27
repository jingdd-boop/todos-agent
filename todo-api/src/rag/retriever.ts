import fs from "node:fs/promises";
import path from "node:path";

export type RagSource = { file: string; title: string; content: string };

export async function searchProjectDocs(query: string, topK = 3): Promise<RagSource[]> {
  const docsDir = path.resolve(process.cwd(), "docs");
  const files = (await fs.readdir(docsDir)).filter((file) => file.endsWith(".md"));
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches: Array<RagSource & { score: number }> = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(docsDir, file), "utf8");
    for (const chunk of content.split(/\n(?=#|---)/).filter((item) => item.trim())) {
      const lower = chunk.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      if (score > 0)
        matches.push({
          file: `docs/${file}`,
          title: chunk.match(/^#+\s*(.+)$/m)?.[1] ?? file,
          content: chunk.slice(0, 1200),
          score,
        });
    }
  }
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(topK, 1), 5))
    .map(({ score: _score, ...source }) => source);
}
