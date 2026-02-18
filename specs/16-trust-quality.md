# Spec: Trust and Quality Scoring

**Purpose:** Compute and display a quality score for each spec package so developers can assess reliability before installing.

## Data Model

### QualityScore
```typescript
{
  overall: number             // 0.0 - 1.0
  breakdown: {
    verification: number      // L0-L3 level achieved (0.25 per level)
    completeness: number      // Has entities, states, constraints, docs
    maintenance: number       // Recent updates, responsive author
    adoption: number          // Downloads, dependents count
  }
  badges: string[]            // ["verified-l2", "complete", "popular"]
  computedAt: string
}
```

### Scoring Formula
```
verification:  L0=0.25, L1=0.50, L2=0.75, L3=1.0
completeness:  0.25 per section (entities, states, constraints, docs)
maintenance:   decay function from last update (1.0 if <30d, 0.5 if <180d, 0.2 if >180d)
adoption:      log scale of weekly downloads (1.0 at 1000+/week)
overall:       weighted average (verification: 0.4, completeness: 0.3, maintenance: 0.15, adoption: 0.15)
```

## API

```
GET /api/v1/packages/:name/score
```

## Behavior

1. Score computed on publish and re-computed daily
2. Displayed in search results and package detail
3. Badges awarded for thresholds (e.g., score > 0.8 = "high-quality")
4. CLI shows score during `specpm install` (info line)

## Constraints

- Score must be deterministic given same inputs
- Score must update within 24 hours of new version publish
- Scores are public (no authentication required)
- Cannot be gamed by rapid republishing (version count doesn't factor in)

## Edge Cases

- Brand new package with no downloads → adoption = 0, rest scored normally
- Package with only docs → completeness reflects what's present
- Deprecated package → score frozen at deprecation, shown as deprecated

## Acceptance Criteria

- [ ] Score computed and returned for all packages
- [ ] Breakdown shows individual component scores
- [ ] Badges awarded at correct thresholds
- [ ] Score visible in `specpm search` output
- [ ] Daily recomputation works for all packages
