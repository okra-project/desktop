import type {
  QueryAST,
  QueryResultSet,
  QueryResultItem,
  QuerySource,
  WhereClause,
  EntitySelector,
} from '../../shared/types/query';
import { indexService } from '../services/index.service';
import { storeService } from '../services/store.service';
import type { EntityType, IndexedBbox } from '../../shared/types';

let currentWorkspaceId: string | null = null;

export function setCurrentWorkspace(id: string | null): void {
  currentWorkspaceId = id;
}

export function getCurrentWorkspace(): string | null {
  if (currentWorkspaceId) return currentWorkspaceId;

  const lastPath = storeService.getLastWorkspacePath();
  if (lastPath) {
    const ws = storeService
      .getLocalWorkspaces()
      .find((w) => w.workspacePath === lastPath);
    if (ws) return ws.id;
  }

  const workspaces = storeService.getLocalWorkspaces();
  return workspaces.length > 0 ? workspaces[0].id : null;
}

class QueryEngine {
  async execute(query: QueryAST): Promise<QueryResultSet> {
    const start = Date.now();

    const workspaceIds = this.resolveSource(query.from);
    let results = this.queryIndex(workspaceIds, query.select, query.from);

    if (query.where?.length) {
      results = this.applyFilters(results, query.where);
    }

    if (query.orderBy) {
      results = this.sortResults(results, query.orderBy);
    }

    const totalCount = results.length;
    const truncated = query.limit ? totalCount > query.limit : false;

    if (query.limit) {
      const offset = query.offset || 0;
      results = results.slice(offset, offset + query.limit);
    }

    return {
      query,
      executedAt: new Date().toISOString(),
      results,
      totalCount,
      truncated,
      executionMs: Date.now() - start,
    };
  }

  private resolveSource(source: QuerySource): string[] {
    switch (source.type) {
      case 'all':
        return storeService.getLocalWorkspaces().map((w) => w.id);

      case 'current': {
        const current = getCurrentWorkspace();
        return current ? [current] : [];
      }

      case 'workspace':
        return [source.id];

      case 'page': {
        const wsId =
          source.workspaceId === 'current'
            ? getCurrentWorkspace()
            : source.workspaceId;
        return wsId ? [wsId] : [];
      }

      default:
        return [];
    }
  }

  private queryIndex(
    workspaceIds: string[],
    select: EntitySelector[],
    source: QuerySource,
  ): QueryResultItem[] {
    const types = select.includes('all') ? undefined : (select as EntityType[]);

    const results: QueryResultItem[] = [];

    for (const docId of workspaceIds) {
      const workspace = storeService.getWorkspaceById(docId);
      if (!workspace) continue;

      const searchResults = indexService.search({
        query: '',
        documentId: docId,
        entityTypes: types,
        limit: 10000,
      });

      for (const r of searchResults) {
        if (source.type === 'page' && r.entity.pageNumber !== source.page) {
          continue;
        }

        results.push(this.toResultItem(r.entity, r.score));
      }
    }

    return results;
  }

  private toResultItem(entity: IndexedBbox, score: number): QueryResultItem {
    return {
      id: entity.id,
      workspaceId: entity.documentId,
      workspaceName: entity.documentName,
      page: entity.pageNumber,
      type: entity.type,
      bbox: entity.bbox,
      text: entity.text,
      confidence: score,
    };
  }

  private applyFilters(
    results: QueryResultItem[],
    clauses: WhereClause[],
  ): QueryResultItem[] {
    return results.filter((item) =>
      clauses.every((clause) => this.evaluateClause(item, clause)),
    );
  }

  private evaluateClause(item: QueryResultItem, clause: WhereClause): boolean {
    const value = this.extractField(item, clause.field);

    switch (clause.op) {
      case 'eq':
        return value === clause.value;
      case 'neq':
        return value !== clause.value;
      case 'gt':
        return typeof value === 'number' && value > (clause.value as number);
      case 'gte':
        return typeof value === 'number' && value >= (clause.value as number);
      case 'lt':
        return typeof value === 'number' && value < (clause.value as number);
      case 'lte':
        return typeof value === 'number' && value <= (clause.value as number);
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes((clause.value as string).toLowerCase())
        );
      case 'startsWith':
        return (
          typeof value === 'string' &&
          value.toLowerCase().startsWith((clause.value as string).toLowerCase())
        );
      case 'endsWith':
        return (
          typeof value === 'string' &&
          value.toLowerCase().endsWith((clause.value as string).toLowerCase())
        );
      case 'matches':
        return (
          typeof value === 'string' &&
          new RegExp(clause.value as string, 'i').test(value)
        );
      case 'in':
        return (clause.value as unknown[]).includes(value);
      case 'notIn':
        return !(clause.value as unknown[]).includes(value);
      default:
        return true;
    }
  }

  private extractField(item: QueryResultItem, field: string): unknown {
    switch (field) {
      case 'type':
        return item.type;
      case 'text':
        return item.text;
      case 'confidence':
        return item.confidence;
      case 'page':
        return item.page;
      case 'workspace':
        return item.workspaceId;
      case 'amount':
        return this.extractAmount(item.text);
      case 'date':
        return this.extractDate(item.text);
      default:
        return item.metadata?.[field];
    }
  }

  private extractAmount(text: string): number | null {
    const match = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
    if (!match) return null;
    return parseFloat(match[1].replace(/,/g, ''));
  }

  private extractDate(text: string): string | null {
    const match = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  private sortResults(
    results: QueryResultItem[],
    orderBy: { field: string; dir: 'asc' | 'desc' },
  ): QueryResultItem[] {
    return [...results].sort((a, b) => {
      const aVal = this.extractField(a, orderBy.field);
      const bVal = this.extractField(b, orderBy.field);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return orderBy.dir === 'desc' ? -cmp : cmp;
    });
  }
}

export const queryEngine = new QueryEngine();
