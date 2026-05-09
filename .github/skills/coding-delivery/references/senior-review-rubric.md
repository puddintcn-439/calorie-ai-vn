# Senior Review Rubric

Use this rubric after implementation.

## Severity Levels
- High: can cause incidents, data loss, security issue, or major regression.
- Medium: functional risk, maintainability debt, flaky behavior.
- Low: style, readability, minor optimization.

## Review Domains
1. Correctness
- Matches acceptance criteria.
- Handles edge cases and invalid input.
- No hidden behavior regressions.

2. Reliability
- Timeouts/retries handled where needed.
- Error boundaries and fallback paths are clear.
- No race conditions in async logic.

3. Security
- Authz/authn checks preserved.
- No secret leakage.
- Input sanitization and injection controls present.

4. Performance
- No obvious N+1 or unnecessary rerenders.
- Critical path complexity is acceptable.

5. Data Safety
- Schema/migrations are safe and reversible where required.
- Write operations preserve invariants.

6. Testing Adequacy
- Tests validate success, failure, and edge paths.
- Assertions are meaningful, not superficial.

7. Maintainability
- Naming, structure, and module boundaries are clear.
- Avoid duplicated domain logic.

## Output Format
- Findings first, ordered by severity.
- Include file references and concise rationale.
- Include fix actions and status.
