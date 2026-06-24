/**
 * ForceKit Web Search Tool
 *
 * Simulates web and document searches on Salesforce developer documentation,
 * release notes, and Agentforce guidelines based on query keywords.
 */

import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

export interface SearchResultEntry {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchSummary {
  query: string;
  totalResults: number;
  results: SearchResultEntry[];
}

const MOCK_RELEASE_DATABASE: SearchResultEntry[] = [
  {
    title: 'Apex User Mode Database Operations',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_db_user_mode.htm',
    snippet: 'Database operations can now run in user mode rather than system mode. Enforce object-level and field-level security by adding WITH USER_MODE to SOQL queries or AccessLevel.USER_MODE to DML operations.',
  },
  {
    title: 'WITH SECURITY_ENFORCED Deprecation in API v67.0',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_db_security_enforced.htm',
    snippet: 'WITH SECURITY_ENFORCED is deprecated in API v67.0 and later. Use WITH USER_MODE instead to enforce field and object-level permissions natively in SOQL queries.',
  },
  {
    title: 'Agentforce Atlas Reasoning Engine Overview',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_atlas_reasoning.htm',
    snippet: 'The Atlas reasoning engine is the brain behind Agentforce. It plans, decides, and executes subagent actions by dynamically selecting available copilot actions, Apex invocable actions, and flow definitions.',
  },
  {
    title: 'Best Practices for Apex Triggers in Agentforce Contexts',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_best_practices.htm',
    snippet: "Keep triggers logic-less and delegate execution to helper/handler classes. Ensure DML operations in triggers run in User Mode using 'as user' DML syntax to prevent privilege escalation by Copilot users.",
  },
  {
    title: 'Invocable Actions in Agentforce Custom Actions',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_invocable_actions.htm',
    snippet: 'Expose Apex classes to Agentforce agents using the @InvocableMethod annotation. Always describe input and output parameters accurately, as the Atlas reasoning engine uses these descriptions to decide when to call the action.',
  },
];

export class SearchEngine {
  /**
   * Search database for entries matching query keywords
   */
  search(query: string, limit = 5): SearchSummary {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let matched = MOCK_RELEASE_DATABASE.filter((entry) => {
      const text = (entry.title + ' ' + entry.snippet).toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });

    // Fallback if no keywords matched specifically
    if (matched.length === 0) {
      matched = MOCK_RELEASE_DATABASE.slice(0, 2);
    }

    const results = matched.slice(0, limit);

    return {
      query,
      totalResults: results.length,
      results,
    };
  }
}

/** Factory function to create the Tool representation */
export function createSearchTool(config?: ForceKitConfig): Tool {
  return {
    name: 'web-search',
    description: 'Search Salesforce developer documentation, release notes, and web resources for platform features, limits, and APIs',
    inputs: [
      { name: 'query', type: 'string', required: true, description: 'Search term or keywords' },
      { name: 'limit', type: 'number', required: false, description: 'Maximum number of results to return', default: 5 },
    ],
    async execute(args): Promise<ToolResult<SearchSummary>> {
      const query = args.query as string;
      const limit = (args.limit as number) ?? 5;

      const engine = new SearchEngine();
      try {
        const results = engine.search(query, limit);
        return {
          success: true,
          data: results,
          durationMs: 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    },
  };
}
