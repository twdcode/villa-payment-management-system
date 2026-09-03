# Frontend Checklist

Use this checklist for every new screen, flow, and shared component.

## Foundation

- Use the shared token system in `src/app/globals.css`; do not introduce component-specific hex colours, font families, spacing scales, or radii.
- Compose existing UI primitives before creating a new component. Promote repeated, domain-specific UI into a reusable component.
- Keep data access behind the repository interface so Supabase can replace localStorage without UI rewrites.
- Match the supplied Figma frame or approved flow. Ask for a design reference before inventing a new flow.
- Verify desktop and mobile layout, keyboard interaction, focus states, empty states, loading states, errors, and success feedback.

## Data And State Review

- **TanStack Query:** add it when a feature has shared server data across screens, cache invalidation, background refresh, pagination, or optimistic mutations. Do not add it for isolated localStorage reads in this Phase 1 mock.
- **Zod:** add it when forms have multi-field validation, schema reuse across client and backend, or complex API payloads. Native focused validation is sufficient for small single-field mock forms.
- **Zustand or Redux:** add a client-state store only when unrelated routes need the same interactive state or state transitions become difficult to manage locally. Prefer React component state for local dialogs, tabs, and form drafts. Prefer Zustand before Redux unless the project later needs Redux-specific middleware and tooling.
- Record the decision in the PRD addendum whenever one of these tools is introduced or deliberately deferred for a substantial feature.

## Handoff

- Update the PRD addendum for user-facing behavior, permissions, validation, and irreversible actions.
- Run ESLint, TypeScript, tests, and a production build before completing a feature.
