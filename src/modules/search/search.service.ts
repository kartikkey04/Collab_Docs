/**
 * search.service.ts
 *
 * Full-text document search using Postgres tsvector.
 *
 * WHY POSTGRES FTS INSTEAD OF ILIKE?
 *   ILIKE '%query%' performs a full table scan — no index possible.
 *   tsvector + GIN index processes millions of rows in milliseconds.
 *   Bonus: stemming ("running" matches "run"), ranking (ts_rank),
 *   and language-aware stop-word removal ("the", "is" ignored).
 *
 * RANKING:
 *   ts_rank_cd weights: title match (weight A) > content match (weight B).
 *   We include a headline snippet so the UI can highlight matching text.
 *
 * SCOPE:
 *   Returns documents the user owns OR is a collaborator on.
 */

import { prisma } from "../../services/db/prisma.js";

export class SearchService {
  async search(userId: string, query: string, limit = 20) {
    if (!query.trim()) return [];

    // Build a tsquery: tokenise + AND-join terms
    // e.g. "product roadmap" → "product & roadmap"
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .map((term) => term.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(Boolean)
      .join(" & ");

    if (!tsQuery) return [];

    // Raw query because Prisma doesn't support tsvector operations natively
    const results = await prisma.$queryRaw<
      Array<{
        id:         string;
        title:      string;
        updatedAt:  Date;
        rank:       number;
        headline:   string;
        isOwner:    boolean;
      }>
    >`
      SELECT
        d.id,
        d.title,
        d."updatedAt",
        ts_rank_cd(d."searchVector", to_tsquery('english', ${tsQuery})) AS rank,
        ts_headline(
          'english',
          d.content,
          to_tsquery('english', ${tsQuery}),
          'MaxWords=15, MinWords=5, StartSel=<mark>, StopSel=</mark>'
        ) AS headline,
        (d."userId" = ${userId}) AS "isOwner"
      FROM "Document" d
      WHERE
        d."searchVector" @@ to_tsquery('english', ${tsQuery})
        AND (
          d."userId" = ${userId}
          OR EXISTS (
            SELECT 1 FROM "DocumentCollaborator" dc
            WHERE dc."documentId" = d.id AND dc."userId" = ${userId}
          )
        )
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results;
  }
}

export const searchService = new SearchService();
