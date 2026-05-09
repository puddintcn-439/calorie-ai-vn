# Git Release Protocol

Use non-interactive git workflow:
1. `git status --short`
2. `git add -A`
3. `git commit -m "<type(scope): message>"`
4. `git push origin main`

Pre-push checks:
- Build passes
- Tests pass
- Coverage requirement met
- Documentation updated
- Review findings resolved

Required output:
- Commit hash
- Branch name
- Push confirmation
