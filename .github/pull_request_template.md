## What

<!-- What changed and why. Link the issue: Closes #123 -->

## How to test

## Checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Schema changes have a generated migration (`pnpm db:generate`)
- [ ] Ingest changes respect robots.txt / rate limits and store facts only
