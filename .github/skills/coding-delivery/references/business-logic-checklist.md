# Business Logic Checklist

Before coding, verify:
- Problem statement is explicit and scoped.
- Actors, permissions, and data ownership are clear.
- Input/output contracts are defined.
- Edge cases and failure paths are specified.
- Data validation rules are complete.
- State transitions are deterministic.
- Idempotency requirements are captured.
- Backward compatibility impact is assessed.
- Non-functional constraints are known: latency, security, auditability.

Implementation guardrails:
- Keep existing public APIs unless change is required.
- Preserve database invariants and migration safety.
- Prefer explicit domain rules over UI-only assumptions.
- Add comments only where logic is complex.
