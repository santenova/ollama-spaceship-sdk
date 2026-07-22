/**
 * ES query translation helpers — extracted from es-entities.ts so they can be
 * unit-tested independently and reused by other ES-backed modules.
 */

/** Fields that are mapped as date or numeric — sort directly (no .keyword). */
export const DATE_NUMERIC_FIELDS = new Set([
  'created_date', 'updated_date', 'use_count', 'rating', 'rating_count',
  'version', 'chunk_index', 'total_chunks', 'file_size', 'word_count',
  'message_count', 'score',
]);

/**
 * Sort string → ES sort array.
 *   '-created_date'  → [{ created_date: { order: 'desc' } }]
 *   'name'           → [{ 'name.keyword': { order: 'asc' } }]
 */
export const parseSort = (sort: any): any[] => {
  if (!sort) return [{ created_date: { order: 'desc' } }, { _doc: { order: 'asc' } }];
  const entries = Array.isArray(sort) ? sort : [sort];
  return entries.map(s => {
    if (typeof s !== 'string') return s;
    const desc = s.startsWith('-');
    const field = desc ? s.slice(1) : s;
    // Use .keyword sub-field for text fields so lexicographic sort works
    const sortField = DATE_NUMERIC_FIELDS.has(field) ? field : `${field}.keyword`;
    return { [sortField]: { order: desc ? 'desc' : 'asc', unmapped_type: 'keyword' } };
  });
};

/**
 * MongoDB-style query → ES bool query.
 *   { field: value }                        → term
 *   { field: { $gte: n, $lt: m } }          → range
 *   { field: { $in: [...] } }               → terms
 *   { field: { $ne: value } }               → must_not term
 *   { field: { $exists: true } }            → exists
 *   { field: { $regex: 'pat' } }            → regexp
 *   { $or: [q1, q2] }                       → should (min_should: 1)
 *   { $and: [q1, q2] }                      → must
 */
export const translateQuery = (query: any): Record<string, any> => {
  if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
    return { match_all: {} };
  }

  const must: any[] = [];
  const mustNot: any[] = [];
  const should: any[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      const clauses = (value as any).map(translateQuery);
      should.push(...clauses);
      continue;
    }
    if (key === '$and') {
      const clauses = (value as any).map(translateQuery);
      must.push(...clauses);
      continue;
    }
    if (key === '$nor') {
      const clauses = (value as any).map(translateQuery);
      mustNot.push(...clauses);
      continue;
    }

    // Operator object ($gte, $in, etc.)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops: any = value;
      const esField = key;

      if (ops.$gte !== undefined || ops.$gt !== undefined ||
          ops.$lte !== undefined || ops.$lt !== undefined) {
        const range: any = {};
        if (ops.$gte !== undefined) range.gte = ops.$gte;
        if (ops.$gt !== undefined) range.gt = ops.$gt;
        if (ops.$lte !== undefined) range.lte = ops.$lte;
        if (ops.$lt !== undefined) range.lt = ops.$lt;
        must.push({ range: { [esField]: range } });
      }
      if (ops.$in !== undefined) {
        must.push({ terms: { [esField]: ops.$in } });
      }
      if (ops.$nin !== undefined) {
        mustNot.push({ terms: { [esField]: ops.$nin } });
      }
      if (ops.$ne !== undefined) {
        mustNot.push({ term: { [esField]: ops.$ne } });
      }
      if (ops.$exists !== undefined) {
        (ops.$exists ? must : mustNot).push({ exists: { field: esField } });
      }
      if (ops.$regex !== undefined) {
        must.push({ regexp: { [esField]: ops.$regex } });
      }
      if (ops.$not !== undefined) {
        mustNot.push(translateQuery({ [esField]: ops.$not }));
      }
      continue;
    }

    // Plain equality — use term on .keyword for strings (exact match, works for
    // filter/delete/updateMany), term directly for numbers/booleans.
    if (value !== null && value !== undefined) {
      if (typeof value === 'string') {
        if (value.includes('*') || value.includes('?')) {
          // Wildcard pattern e.g. "Marine*"
          must.push({ wildcard: { [`${key}.keyword`]: { value: value.toLowerCase(), case_insensitive: true } } });
        } else if (value.includes(' ')) {
          // Multi-word string — use match (full-text) for natural search
          must.push({ match: { [key]: { query: value, operator: 'and' } } });
        } else {
          // Single word — exact term match on .keyword
          must.push({ term: { [`${key}.keyword`]: value } });
        }
      } else {
        must.push({ term: { [key]: value } });
      }
    }
  }

  const bool: any = {};
  if (must.length) bool.must = must;
  if (mustNot.length) bool.must_not = mustNot;
  if (should.length) {
    bool.should = should;
    bool.minimum_should_match = 1;
  }

  return Object.keys(bool).length ? { bool } : { match_all: {} };
};

/** Source field selection for ES _search _source parameter. */
export const sourceFilter = (fields: any) => {
  if (!fields) return undefined;
  const arr = Array.isArray(fields) ? fields : String(fields).split(',');
  return { includes: arr };
};