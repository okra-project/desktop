import type {
  QueryAST,
  EntitySelector,
  QuerySource,
  WhereClause,
  WhereOperator,
  DisplayMode,
} from '../../shared/types/query';

const ENTITY_ALIASES: Record<string, EntitySelector> = {
  table: 'table',
  tables: 'table',
  figure: 'figure',
  figures: 'figure',
  image: 'figure',
  images: 'figure',
  footnote: 'footnote',
  footnotes: 'footnote',
  signature: 'signature',
  signatures: 'signature',
  text: 'text',
  paragraph: 'text',
  paragraphs: 'text',
  all: 'all',
  '*': 'all',
  everything: 'all',
};

const OPERATOR_MAP: Record<string, WhereOperator> = {
  '=': 'eq',
  '==': 'eq',
  '!=': 'neq',
  '<>': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

export function parseQuery(input: string): QueryAST {
  const normalized = input.trim();

  const sqlMatch = normalized.match(
    /^SELECT\s+(.+?)\s+FROM\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
  );

  if (sqlMatch) {
    return parseSqlQuery(sqlMatch);
  }

  return parseNaturalLanguage(normalized);
}

function parseSqlQuery(match: RegExpMatchArray): QueryAST {
  const [, selectPart, fromPart, wherePart, orderPart, limitPart] = match;

  const select = parseSelect(selectPart);
  const from = parseFrom(fromPart.trim());
  const where = wherePart ? parseWhere(wherePart) : undefined;
  const orderBy = orderPart ? parseOrderBy(orderPart) : undefined;
  const limit = limitPart ? parseInt(limitPart, 10) : undefined;

  return { select, from, where, orderBy, limit };
}

function parseSelect(selectPart: string): EntitySelector[] {
  return selectPart.split(',').map((s) => {
    const trimmed = s.trim().toLowerCase();
    return ENTITY_ALIASES[trimmed] || 'all';
  });
}

function parseFrom(fromPart: string): QuerySource {
  const lower = fromPart.toLowerCase();

  if (lower === 'all' || lower === '*') {
    return { type: 'all' };
  }
  if (lower === 'current' || lower === 'this') {
    return { type: 'current' };
  }

  const pageMatch = lower.match(/^page\s+(\d+)(?:\s+(?:of|in)\s+(\S+))?$/);
  if (pageMatch) {
    const pageNum = parseInt(pageMatch[1], 10);
    const workspaceId = pageMatch[2] || 'current';
    return { type: 'page', workspaceId, page: pageNum };
  }

  return { type: 'workspace', id: fromPart };
}

function parseWhere(wherePart: string): WhereClause[] {
  const clauses: WhereClause[] = [];
  const conditions = wherePart.split(/\s+AND\s+/i);

  for (const cond of conditions) {
    const clause = parseCondition(cond.trim());
    if (clause) clauses.push(clause);
  }

  return clauses;
}

function parseCondition(cond: string): WhereClause | null {
  // text CONTAINS 'value' or text CONTAINS "value"
  const containsMatch = cond.match(/(\w+)\s+CONTAINS\s+['"](.+?)['"]/i);
  if (containsMatch) {
    return {
      field: containsMatch[1].toLowerCase() as WhereClause['field'],
      op: 'contains',
      value: containsMatch[2],
    };
  }

  // text MATCHES 'regex'
  const matchesMatch = cond.match(/(\w+)\s+MATCHES\s+['"](.+?)['"]/i);
  if (matchesMatch) {
    return {
      field: matchesMatch[1].toLowerCase() as WhereClause['field'],
      op: 'matches',
      value: matchesMatch[2],
    };
  }

  // text STARTS WITH 'value'
  const startsMatch = cond.match(/(\w+)\s+STARTS\s+WITH\s+['"](.+?)['"]/i);
  if (startsMatch) {
    return {
      field: startsMatch[1].toLowerCase() as WhereClause['field'],
      op: 'startsWith',
      value: startsMatch[2],
    };
  }

  // field IN ('a', 'b', 'c')
  const inMatch = cond.match(/(\w+)\s+IN\s+\((.+?)\)/i);
  if (inMatch) {
    const values = inMatch[2]
      .split(',')
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
    return {
      field: inMatch[1].toLowerCase() as WhereClause['field'],
      op: 'in',
      value: values,
    };
  }

  // field > value (comparison operators)
  const compMatch = cond.match(
    /(\w+)\s*(=|==|!=|<>|>=|<=|>|<)\s*(\d+(?:\.\d+)?)/,
  );
  if (compMatch) {
    return {
      field: compMatch[1].toLowerCase() as WhereClause['field'],
      op: OPERATOR_MAP[compMatch[2]],
      value: parseFloat(compMatch[3]),
    };
  }

  // field = 'string value'
  const eqStringMatch = cond.match(/(\w+)\s*=\s*['"](.+?)['"]/);
  if (eqStringMatch) {
    return {
      field: eqStringMatch[1].toLowerCase() as WhereClause['field'],
      op: 'eq',
      value: eqStringMatch[2],
    };
  }

  return null;
}

function parseOrderBy(orderPart: string): {
  field: string;
  dir: 'asc' | 'desc';
} {
  const parts = orderPart.trim().split(/\s+/);
  return {
    field: parts[0].toLowerCase(),
    dir: parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function parseNaturalLanguage(input: string): QueryAST {
  const lower = input.toLowerCase();

  let select: EntitySelector[] = ['all'];
  for (const [alias, type] of Object.entries(ENTITY_ALIASES)) {
    if (lower.includes(alias) && alias !== 'all' && alias !== '*') {
      select = [type];
      break;
    }
  }

  let from: QuerySource = { type: 'current' };
  if (
    lower.includes('all documents') ||
    lower.includes('all workspaces') ||
    lower.includes('everywhere')
  ) {
    from = { type: 'all' };
  }

  const pageMatch = lower.match(/page\s+(\d+)/);
  if (pageMatch) {
    from = {
      type: 'page',
      workspaceId: 'current',
      page: parseInt(pageMatch[1], 10),
    };
  }

  let where: WhereClause[] | undefined;

  const containingMatch = input.match(
    /(?:containing|with|has)\s+['"]?([^'"]+)['"]?/i,
  );
  if (containingMatch) {
    where = [
      { field: 'text', op: 'contains', value: containingMatch[1].trim() },
    ];
  }

  const amountMatch = lower.match(
    /(?:over|above|greater than|more than)\s+\$?([\d,]+)/,
  );
  if (amountMatch) {
    where = where || [];
    where.push({
      field: 'amount',
      op: 'gt',
      value: parseFloat(amountMatch[1].replace(/,/g, '')),
    });
  }

  const confMatch = lower.match(/confidence\s*(?:>|above|over)\s*([\d.]+)/);
  if (confMatch) {
    where = where || [];
    where.push({
      field: 'confidence',
      op: 'gt',
      value: parseFloat(confMatch[1]),
    });
  }

  return { select, from, where };
}

export function parseDisplayMode(mode: string): DisplayMode {
  const valid: DisplayMode[] = ['grid', 'list', 'carousel', 'split', 'overlay'];
  const lower = mode.toLowerCase() as DisplayMode;
  return valid.includes(lower) ? lower : 'grid';
}
