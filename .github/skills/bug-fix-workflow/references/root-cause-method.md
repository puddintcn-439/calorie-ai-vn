# Root Cause Method

Use this sequence:
1. Symptom: what failed and where.
2. Trigger: what user/system action caused it.
3. Fault location: exact module/function/data path.
4. Why-chain: at least 3 why levels until actionable root cause.
5. Counter-example: prove why similar paths do not fail.
6. Fix strategy: prevent this and nearby variants.

Root cause quality checks:
- Specific: points to code/data/process defect.
- Verifiable: can be validated by test or runtime check.
- Non-blaming: focuses on system behavior, not people.
