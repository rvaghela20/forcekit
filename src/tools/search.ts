/**
 * ForceKit Web Search Tool
 *
 * Provides curated Salesforce documentation and release notes search
 * against a comprehensive reference database of 25+ entries covering
 * Apex, Agentforce, LWC, Flows, Security, and Platform features.
 *
 * NOTE: This is a curated reference database, not a live web search.
 * It enables offline, deterministic results for AI agent research loops
 * without requiring network access or API keys. Entries are sourced from
 * official Salesforce developer documentation and release notes.
 */

import type { Tool, ToolResult } from '../core/registry.js';
import type { ForceKitConfig } from '../config/defaults.js';

export interface SearchResultEntry {
  title: string;
  url: string;
  snippet: string;
  category: string;
}

export interface SearchSummary {
  query: string;
  totalResults: number;
  results: SearchResultEntry[];
}

// ─── Curated Reference Database ─────────────────────────────────

const REFERENCE_DATABASE: SearchResultEntry[] = [
  // ── Apex Core ───────────────────────────────────────────────
  {
    title: 'Apex User Mode Database Operations',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_db_user_mode.htm',
    snippet: 'Database operations can now run in user mode rather than system mode. Enforce object-level and field-level security by adding WITH USER_MODE to SOQL queries or AccessLevel.USER_MODE to DML operations.',
    category: 'apex',
  },
  {
    title: 'WITH SECURITY_ENFORCED Deprecation in API v67.0',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_db_security_enforced.htm',
    snippet: 'WITH SECURITY_ENFORCED is deprecated in API v67.0 and later. Use WITH USER_MODE instead to enforce field and object-level permissions natively in SOQL queries.',
    category: 'apex',
  },
  {
    title: 'Apex Governor Limits Reference',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm',
    snippet: 'Salesforce enforces governor limits to ensure efficient use of shared resources. Key limits include 100 SOQL queries per transaction, 150 DML statements, 50,000 records retrieved per SOQL query, and 6 MB heap size for synchronous operations.',
    category: 'apex',
  },
  {
    title: 'Bulk Apex Design Patterns',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_bestpract.htm',
    snippet: 'Always bulkify Apex code to handle collections of records. Avoid SOQL and DML inside loops. Use Maps for efficient record lookups, and process records in bulk using Trigger.new and Trigger.old context variables.',
    category: 'apex',
  },
  {
    title: 'Asynchronous Apex: Queueable, Batch, and Future Methods',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_async_overview.htm',
    snippet: 'Use asynchronous Apex for long-running operations. Queueable Apex supports chaining and complex types. Batch Apex processes large data volumes in chunks of up to 2,000 records. Future methods handle callouts from triggers.',
    category: 'apex',
  },
  {
    title: 'Platform Events Developer Guide',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_intro.htm',
    snippet: 'Platform Events enable event-driven architecture in Salesforce. Publish events using EventBus.publish() and subscribe using Apex triggers, flows, or CometD. Events support replay and guaranteed delivery semantics.',
    category: 'apex',
  },
  {
    title: 'Apex Testing Best Practices',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_best_practices.htm',
    snippet: 'Write meaningful test methods that verify behavior, not just coverage. Use @TestSetup for shared test data, Test.startTest()/stopTest() to reset governor limits, and assert expected outcomes with System.assertEquals().',
    category: 'apex',
  },

  // ── Agentforce ──────────────────────────────────────────────
  {
    title: 'Agentforce Atlas Reasoning Engine Overview',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_atlas_reasoning.htm',
    snippet: 'The Atlas reasoning engine is the brain behind Agentforce. It plans, decides, and executes subagent actions by dynamically selecting available copilot actions, Apex invocable actions, and flow definitions.',
    category: 'agentforce',
  },
  {
    title: 'Best Practices for Apex Triggers in Agentforce Contexts',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_best_practices.htm',
    snippet: "Keep triggers logic-less and delegate execution to helper/handler classes. Ensure DML operations in triggers run in User Mode using 'as user' DML syntax to prevent privilege escalation by Copilot users.",
    category: 'agentforce',
  },
  {
    title: 'Invocable Actions in Agentforce Custom Actions',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_invocable_actions.htm',
    snippet: 'Expose Apex classes to Agentforce agents using the @InvocableMethod annotation. Always describe input and output parameters accurately, as the Atlas reasoning engine uses these descriptions to decide when to call the action.',
    category: 'agentforce',
  },
  {
    title: 'Agentforce Custom Agent Topics',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_topics.htm',
    snippet: 'Topics define the scope and intent of an Agentforce agent. Each topic includes a description, classifier phrases, and associated actions. The Atlas engine uses topic descriptions to route user requests to the correct agent capability.',
    category: 'agentforce',
  },
  {
    title: 'Prompt Templates for Agentforce',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/agentforce_prompt_templates.htm',
    snippet: 'Prompt templates define structured instructions for LLM interactions within Agentforce. Use merge fields to inject CRM data, ground prompts with record context, and configure temperature and token limits for predictable outputs.',
    category: 'agentforce',
  },
  {
    title: 'Einstein Copilot Actions Reference',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.agentforce.meta/agentforce/copilot_actions_reference.htm',
    snippet: 'Standard copilot actions include record CRUD, knowledge search, and case summarization. Custom actions extend functionality via Apex @InvocableMethod or screen flows. Each action requires clear input/output descriptions for proper Atlas routing.',
    category: 'agentforce',
  },

  // ── LWC ─────────────────────────────────────────────────────
  {
    title: 'Lightning Web Components Wire Service',
    url: 'https://developer.salesforce.com/docs/platform/lwc/guide/data-wire-service-about.html',
    snippet: 'The @wire decorator provides reactive data access in LWC. Wire Apex methods or Lightning Data Service adapters to component properties or functions. Data refreshes automatically when reactive parameters change.',
    category: 'lwc',
  },
  {
    title: 'LWC Component Lifecycle Hooks',
    url: 'https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks.html',
    snippet: 'LWC lifecycle hooks include constructor(), connectedCallback(), renderedCallback(), and disconnectedCallback(). Use connectedCallback for initialization logic and disconnectedCallback for cleanup. Avoid heavy DOM manipulation in constructor.',
    category: 'lwc',
  },
  {
    title: 'Lightning Data Service and Record Operations',
    url: 'https://developer.salesforce.com/docs/platform/lwc/guide/data-ui-api.html',
    snippet: 'Lightning Data Service (LDS) provides CRUD operations without Apex. Use getRecord, createRecord, updateRecord, and deleteRecord wire adapters. LDS enforces CRUD/FLS automatically and provides client-side caching.',
    category: 'lwc',
  },
  {
    title: 'LWC Inter-Component Communication',
    url: 'https://developer.salesforce.com/docs/platform/lwc/guide/events-pubsub.html',
    snippet: 'Components communicate via public properties (@api), custom events (child to parent), and Lightning Message Service (cross-DOM). Use CustomEvent for parent notification and MessageChannel for unrelated component communication.',
    category: 'lwc',
  },

  // ── Security ────────────────────────────────────────────────
  {
    title: 'CRUD and FLS Enforcement in Apex',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_perms_enforcing.htm',
    snippet: 'Enforce CRUD and FLS using Schema.SObjectType methods, stripInaccessible(), or WITH USER_MODE in SOQL. Never bypass security checks — use Security.stripInaccessible(AccessType.READABLE, records) to remove inaccessible fields.',
    category: 'security',
  },
  {
    title: 'Sharing Rules and Apex Managed Sharing',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_bulk_sharing.htm',
    snippet: 'Apex classes run in system mode by default. Use "with sharing" to enforce record-level security. Use "inherited sharing" for utility classes. Apex managed sharing allows programmatic share record creation via __Share objects.',
    category: 'security',
  },
  {
    title: 'Content Security Policy (CSP) for Lightning',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.lightning.meta/lightning/security_csp.htm',
    snippet: 'Lightning enforces strict Content Security Policy. External scripts must be loaded as static resources. Use lightning:navigation for URL handling. Third-party APIs require CSP Trusted Sites and Remote Site Settings.',
    category: 'security',
  },

  // ── Flows ───────────────────────────────────────────────────
  {
    title: 'Flow Builder Best Practices',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.automate.meta/automate/flow_best_practices.htm',
    snippet: 'Bulkify flows by avoiding Get/Update inside loops. Use record-triggered flows instead of Process Builder and workflow rules. Leverage subflows for reusable logic and entry conditions to limit trigger scope.',
    category: 'flows',
  },
  {
    title: 'Record-Triggered Flows: Before vs After Save',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.automate.meta/automate/flow_concepts_triggers.htm',
    snippet: 'Before-save flows run before the record is committed — no DML needed for field updates. After-save flows can update related records and perform DML. Use before-save for efficiency when only modifying the triggering record.',
    category: 'flows',
  },
  {
    title: 'Flow Custom Error Handling and Fault Paths',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.automate.meta/automate/flow_ref_elements_fault.htm',
    snippet: 'Add fault connectors to flow elements to handle errors gracefully. Use custom fault paths to send error notifications, create error logs, or display user-friendly messages in screen flows instead of unhandled fault screens.',
    category: 'flows',
  },

  // ── Platform ────────────────────────────────────────────────
  {
    title: 'Change Data Capture (CDC) Developer Guide',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/cdc_intro.htm',
    snippet: 'Change Data Capture publishes change events for Salesforce record modifications. Subscribe to ChangeEvents in Apex triggers, LWC with empApi, or external systems via CometD. Supports create, update, delete, and undelete.',
    category: 'platform',
  },
  {
    title: 'Custom Metadata Types vs Custom Settings',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_custommetadatatypes.htm',
    snippet: 'Custom Metadata Types are deployable, packageable configuration data accessible in Apex without SOQL counting against limits. Prefer them over Custom Settings for app configuration. Access via CMDT.getInstance() pattern.',
    category: 'platform',
  },
  {
    title: 'Big Objects for Data Archival',
    url: 'https://developer.salesforce.com/docs/atlas.en-us.bigobjects.meta/bigobjects/big_object_intro.htm',
    snippet: 'Big Objects store and manage massive data volumes (billions of records) on the Salesforce platform. Use async SOQL for queries and Database.insertImmediate() for inserts. Ideal for audit trails, historical data, and IoT.',
    category: 'platform',
  },
];

// ─── Search Engine ──────────────────────────────────────────────

export class SearchEngine {
  private static cache = new Map<string, SearchSummary>();

  /**
   * Clear the search cache (primarily for testing purposes).
   */
  static clearCache(): void {
    SearchEngine.cache.clear();
  }

  /**
   * Search the reference database for entries matching query keywords.
   * Results are ranked by relevance (number of matching keywords).
   */
  search(query: string, limit = 5): SearchSummary {
    const cacheKey = `${query.toLowerCase()}:${limit}`;
    const cached = SearchEngine.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) {
      const emptyResult: SearchSummary = {
        query,
        totalResults: 0,
        results: [],
      };
      SearchEngine.cache.set(cacheKey, emptyResult);
      return emptyResult;
    }

    // Score each entry by number of matching keywords
    const scored = REFERENCE_DATABASE.map((entry) => {
      const text = (entry.title + ' ' + entry.snippet + ' ' + entry.category).toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          // Title matches are weighted higher than snippet matches
          const titleText = entry.title.toLowerCase();
          score += titleText.includes(kw) ? 3 : 1;
        }
      }
      return { entry, score };
    });

    // Filter to entries with at least one match, sorted by relevance
    let matched = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.entry);

    // Fallback: return top general entries if no keywords matched
    if (matched.length === 0) {
      matched = REFERENCE_DATABASE.slice(0, 2);
    }

    const results = matched.slice(0, limit);

    const summary: SearchSummary = {
      query,
      totalResults: matched.length,
      results,
    };

    SearchEngine.cache.set(cacheKey, summary);
    return summary;
  }
}

/** Factory function to create the Tool representation */
export function createSearchTool(config?: ForceKitConfig): Tool {
  return {
    name: 'web-search',
    description: 'Search Salesforce developer documentation, release notes, and web resources for platform features, limits, and APIs. Results are sourced from a curated reference database of official Salesforce documentation.',
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
