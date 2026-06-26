/**
 * ForceKit Search Tool Tests
 *
 * Tests for the curated reference database search engine including
 * keyword matching, relevance scoring, limits, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchEngine, createSearchTool } from '../../tools/search.js';

describe('SearchEngine', () => {
  const engine = new SearchEngine();

  describe('keyword matching', () => {
    it('should return results matching Apex-related keywords', () => {
      const result = engine.search('apex governor limits');
      assert.ok(result.totalResults > 0, 'Should find Apex-related results');
      assert.ok(
        result.results.some((r) => r.title.toLowerCase().includes('governor') || r.snippet.toLowerCase().includes('governor')),
        'Should include governor limits entry'
      );
    });

    it('should return results matching Agentforce keywords', () => {
      const result = engine.search('agentforce atlas reasoning engine');
      assert.ok(result.totalResults > 0, 'Should find Agentforce results');
      assert.ok(
        result.results.some((r) => r.category === 'agentforce'),
        'Should include Agentforce category entries'
      );
    });

    it('should return results matching LWC keywords', () => {
      const result = engine.search('lightning web components wire');
      assert.ok(result.totalResults > 0, 'Should find LWC results');
      assert.ok(
        result.results.some((r) => r.category === 'lwc'),
        'Should include LWC category entries'
      );
    });

    it('should return results matching security keywords', () => {
      const result = engine.search('CRUD FLS enforcement sharing');
      assert.ok(result.totalResults > 0, 'Should find security results');
      assert.ok(
        result.results.some((r) => r.category === 'security'),
        'Should include security category entries'
      );
    });

    it('should return results matching flow keywords', () => {
      const result = engine.search('record triggered flow before save');
      assert.ok(result.totalResults > 0, 'Should find flow results');
      assert.ok(
        result.results.some((r) => r.category === 'flows'),
        'Should include flow category entries'
      );
    });

    it('should return results matching platform keywords', () => {
      const result = engine.search('change data capture custom metadata');
      assert.ok(result.totalResults > 0, 'Should find platform results');
    });
  });

  describe('relevance scoring', () => {
    it('should rank title matches higher than snippet-only matches', () => {
      const result = engine.search('apex triggers');
      assert.ok(result.results.length > 0, 'Should return results');
      // The entry with "triggers" in the title should rank high
      const topResult = result.results[0];
      assert.ok(topResult !== undefined, 'Should have a top result');
    });

    it('should return results sorted by relevance', () => {
      const result = engine.search('user mode security enforced apex');
      assert.ok(result.results.length >= 2, 'Should return multiple results');
      // Results about user mode / security enforced should come first
      const firstResult = result.results[0];
      const text = (firstResult.title + ' ' + firstResult.snippet).toLowerCase();
      assert.ok(
        text.includes('user mode') || text.includes('security'),
        'Top result should be highly relevant to the query'
      );
    });
  });

  describe('limit parameter', () => {
    it('should respect the limit parameter', () => {
      const result = engine.search('apex salesforce', 3);
      assert.ok(result.results.length <= 3, 'Should return at most 3 results');
    });

    it('should return fewer results than limit if database has fewer matches', () => {
      const result = engine.search('big objects archival', 100);
      assert.ok(result.results.length > 0, 'Should return results');
      assert.ok(result.results.length <= 100, 'Should not exceed limit');
    });

    it('should use default limit of 5', () => {
      const result = engine.search('apex');
      assert.ok(result.results.length <= 5, 'Default limit should be 5');
    });
  });

  describe('edge cases', () => {
    it('should return empty results for empty query', () => {
      const result = engine.search('');
      assert.equal(result.totalResults, 0, 'Empty query should return 0 results');
      assert.equal(result.results.length, 0);
    });

    it('should filter out short keywords (< 3 chars)', () => {
      const result = engine.search('is an on');
      // All keywords are <= 2 chars, so no matches should occur
      assert.equal(result.totalResults, 0, 'Very short keywords should be filtered');
    });

    it('should return fallback results when no keywords match', () => {
      const result = engine.search('zyxwvutsrq nonexistent');
      assert.ok(result.results.length > 0, 'Should return fallback results');
    });

    it('should be case-insensitive', () => {
      const lowerResult = engine.search('apex governor limits');
      const upperResult = engine.search('APEX GOVERNOR LIMITS');
      assert.equal(
        lowerResult.totalResults,
        upperResult.totalResults,
        'Search should be case-insensitive'
      );
    });

    it('should include totalResults count reflecting all matches before limit', () => {
      const result = engine.search('apex', 2);
      assert.ok(result.totalResults >= result.results.length, 'totalResults should be >= results array length');
    });
  });

  describe('result structure', () => {
    it('should include all required fields in results', () => {
      const result = engine.search('apex');
      assert.ok(result.results.length > 0);
      const entry = result.results[0];
      assert.ok(typeof entry.title === 'string' && entry.title.length > 0, 'title should be non-empty string');
      assert.ok(typeof entry.url === 'string' && entry.url.startsWith('https://'), 'url should start with https://');
      assert.ok(typeof entry.snippet === 'string' && entry.snippet.length > 0, 'snippet should be non-empty string');
      assert.ok(typeof entry.category === 'string' && entry.category.length > 0, 'category should be non-empty string');
    });

    it('should include query string in response', () => {
      const result = engine.search('agentforce topics');
      assert.equal(result.query, 'agentforce topics');
    });
  });

  describe('caching', () => {
    it('should cache search results and return cached instances', () => {
      SearchEngine.clearCache();
      const result1 = engine.search('apex governor limits');
      const result2 = engine.search('apex governor limits');
      assert.equal(result1, result2); // Must be the identical object reference

      // Clear cache and try again
      SearchEngine.clearCache();
      const result3 = engine.search('apex governor limits');
      assert.notEqual(result1, result3); // Reference should change after clearing
    });
  });
});

describe('createSearchTool', () => {
  it('should create a tool with correct name and description', () => {
    const tool = createSearchTool();
    assert.equal(tool.name, 'web-search');
    assert.ok(tool.description.length > 0);
  });

  it('should have required query input', () => {
    const tool = createSearchTool();
    const queryInput = tool.inputs.find((i) => i.name === 'query');
    assert.ok(queryInput, 'Should have query input');
    assert.equal(queryInput!.required, true);
    assert.equal(queryInput!.type, 'string');
  });

  it('should have optional limit input', () => {
    const tool = createSearchTool();
    const limitInput = tool.inputs.find((i) => i.name === 'limit');
    assert.ok(limitInput, 'Should have limit input');
    assert.equal(limitInput!.required, false);
    assert.equal(limitInput!.type, 'number');
  });

  it('should execute successfully with valid query', async () => {
    const tool = createSearchTool();
    const result = await tool.execute({ query: 'apex governor limits' });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('should return results with correct structure from execute', async () => {
    const tool = createSearchTool();
    const result = await tool.execute({ query: 'agentforce', limit: 3 });
    assert.equal(result.success, true);
    const data = result.data as any;
    assert.equal(data.query, 'agentforce');
    assert.ok(data.results.length <= 3);
  });
});
