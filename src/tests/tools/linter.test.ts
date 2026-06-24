/**
 * Tests for ForceKit Linter
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from '../../tools/linter.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';

const lintConfig = DEFAULT_CONFIG.lint;

describe('Linter', () => {
  describe('sharing-keyword-required', () => {
    const linter = new Linter({ ...lintConfig, rules: { ...lintConfig.rules, 'sharing-keyword-required': true } });

    it('should flag classes without sharing keyword', () => {
      const content = `public class AccountService {\n  // no sharing\n}`;
      const result = linter.lintContent(content, '/test/AccountService.cls');
      assert.ok(result.violations.length > 0, 'Should flag missing sharing keyword');
      assert.equal(result.violations[0].ruleId, 'sharing-keyword-required');
    });
  });

  describe('no-soql-in-loops', () => {
    it('should detect SOQL inside for loops', () => {
      const rule = createRuleChecker('no-soql-in-loops');

      const badCode = `
public class Bad {
  public void doStuff(List<Id> ids) {
    for (Id id : ids) {
      Account a = [SELECT Id FROM Account WHERE Id = :id];
    }
  }
}`;
      const violations = rule(badCode, 'Bad.cls');
      assert.ok(violations.length > 0, 'Should detect SOQL in loop');
      assert.equal(violations[0].ruleId, 'no-soql-in-loops');
    });

    it('should allow SOQL outside loops', () => {
      const rule = createRuleChecker('no-soql-in-loops');

      const goodCode = `
public class Good {
  public void doStuff(Set<Id> ids) {
    List<Account> accounts = [SELECT Id FROM Account WHERE Id IN :ids];
    for (Account a : accounts) {
      System.debug(a.Id);
    }
  }
}`;
      const violations = rule(goodCode, 'Good.cls');
      assert.equal(violations.length, 0, 'Should not flag SOQL outside loop');
    });
  });

  describe('no-dml-in-loops', () => {
    it('should detect DML inside loops', () => {
      const rule = createRuleChecker('no-dml-in-loops');

      const badCode = `
public class Bad {
  public void doStuff(List<Account> accounts) {
    for (Account a : accounts) {
      update a;
    }
  }
}`;
      const violations = rule(badCode, 'Bad.cls');
      assert.ok(violations.length > 0, 'Should detect DML in loop');
    });
  });

  describe('no-hardcoded-ids', () => {
    it('should detect hardcoded Salesforce IDs', () => {
      const rule = createRuleChecker('no-hardcoded-ids');

      const badCode = `String accId = '001000000000001AAA';`;
      const violations = rule(badCode, 'Bad.cls');
      assert.ok(violations.length > 0, 'Should detect hardcoded ID');
    });

    it('should not flag non-ID strings', () => {
      const rule = createRuleChecker('no-hardcoded-ids');

      const goodCode = `String name = 'hello world';`;
      const violations = rule(goodCode, 'Good.cls');
      assert.equal(violations.length, 0, 'Should not flag normal strings');
    });
  });

  describe('no-empty-catch', () => {
    it('should detect empty catch blocks', () => {
      const rule = createRuleChecker('no-empty-catch');

      const badCode = `
try {
  doSomething();
} catch (Exception e) {}
`;
      const violations = rule(badCode, 'Bad.cls');
      assert.ok(violations.length > 0, 'Should detect empty catch');
    });
  });

  describe('no-see-all-data', () => {
    it('should detect SeeAllData=true', () => {
      const rule = createRuleChecker('no-see-all-data');

      const badCode = `@IsTest(SeeAllData=true)\nprivate class BadTest {}`;
      const violations = rule(badCode, 'BadTest.cls');
      assert.ok(violations.length > 0, 'Should detect SeeAllData=true');
    });
  });

  describe('no-security-enforced', () => {
    it('should flag deprecated WITH SECURITY_ENFORCED', () => {
      const rule = createRuleChecker('no-security-enforced');

      const badCode = `List<Account> a = [SELECT Id FROM Account WITH SECURITY_ENFORCED];`;
      const violations = rule(badCode, 'Old.cls');
      assert.ok(violations.length > 0, 'Should flag SECURITY_ENFORCED');
    });
  });

  describe('lwc-naming-standard', () => {
    it('should flag PascalCase LWC folders', () => {
      const rule = createRuleChecker('lwc-naming-standard');

      const violations = rule('export default class {}', 'force-app/main/default/lwc/AccountSummary/AccountSummary.js');
      assert.ok(violations.length > 0, 'Should flag PascalCase folder');
    });

    it('should allow camelCase LWC folders', () => {
      const rule = createRuleChecker('lwc-naming-standard');

      const violations = rule('export default class {}', 'force-app/main/default/lwc/accountSummary/accountSummary.js');
      assert.equal(violations.length, 0, 'Should allow camelCase');
    });
  });
});

// ─── Helper ─────────────────────────────────────────────────────

/**
 * Creates a test helper that runs a specific rule's check function directly.
 */
function createRuleChecker(ruleId: string): (content: string, filePath: string) => Array<{ ruleId: string; message: string; line: number; severity: string }> {
  // Isolate the rule being checked by disabling all other rules
  const rulesConfig: Record<string, boolean> = {};
  if (lintConfig.rules) {
    for (const key of Object.keys(lintConfig.rules)) {
      rulesConfig[key] = false;
    }
  }
  rulesConfig[ruleId] = true;

  const linter = new Linter({ ...lintConfig, rules: rulesConfig });
  return (content: string, filePath: string) => {
    return linter.lintContent(content, filePath).violations;
  };
}
