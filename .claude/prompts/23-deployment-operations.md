# Block 23 — Deployment and Operations

## Objective

Establish reproducible environments, an automated delivery pipeline, and the
operational controls — backup, restore, rollback, monitoring, alerting, and incident
response — required to run Crux in production.

## Scope

### In scope

- The four environments, CI/CD, migration and function deployment, scheduled jobs,
  backup and restore, rollback, monitoring, alerting, and incident response.
- OAuth environment validation.

### Out of scope

- Provisioning production credentials or performing a production deployment, which
  require explicit human authorisation outside this architecture.

## Dependencies

Blocks 04, 07, 19, 22.

## Required Inputs

- `.claude/prompts/04-supabase-foundation.md`, `.claude/prompts/07-rls-security.md`,
  `.claude/prompts/19-analytics-observability.md`, `.claude/prompts/22-testing-quality.md`.
- `.claude/rules/security.md`, `.claude/rules/documentation.md`.

## Required Outputs

- CI/CD workflows.
- Environment configuration matrix and validation.
- `docs/deployment.md`, `docs/backup-recovery.md`, `docs/incident-response.md`.

## Functional Requirements

1. **Local environment.** Reproducible from a clean checkout: install, `supabase
   start`, reset, seed, and run. Every documented command must have been executed.
2. **Development.** A shared development environment with non-production data, its
   own Supabase project, and unrestricted debugging.
3. **Staging.** Production-equivalent configuration, production-equivalent data
   volume with anonymised data, and the same gates as production. Staging is the
   rehearsal environment for every migration and rollback.
4. **Production.** Restricted access, no debug output, full monitoring, and change
   only through the pipeline.
5. **CI/CD.** On pull request: install, type check, lint, unit, database, RLS,
   integration, accessibility, and security tests, secret scan, dependency scan, and
   production build. On merge to the default branch: deploy to staging, run
   post-deploy validation, and gate production on explicit approval.
6. **Migration process.** Migrations apply automatically to development and staging,
   and to production only through an approved release. Every migration is rehearsed
   on staging against production-equivalent data. Destructive migrations require an
   explicit approval step and a rehearsed reverse procedure.
7. **Edge Function deployment.** Functions deploy per environment with
   environment-scoped secrets, versioned, and rolled back independently of the
   application.
8. **Next.js deployment.** Immutable build artefacts, environment variables injected
   at build or runtime as appropriate, and a documented promotion path from staging
   to production.
9. **Scheduled jobs.** Search indexing, embedding, scheduled publication, retention
   purge, quarantine cleanup, and newsletter queue draining. Each has a schedule, an
   owner, an expected window, and monitoring for missed runs. Job endpoints are
   protected by the cron secret.
10. **Backups.** Automated database backups with a defined frequency and retention,
    plus storage bucket backup or documented replication. Backup success is
    monitored; a silent backup failure must be detectable.
11. **Restore.** A documented and **rehearsed** restore procedure with a recorded
    recovery time and recovery point objective. A restore procedure that has never
    been executed is not an acceptable control.
12. **Rollback.** Application rollback to the previous artefact, function rollback,
    and a documented database rollback strategy including the forward-fix-preferred
    policy and the conditions under which a restore is used instead.
13. **Monitoring.** Uptime, error rate, latency, database health, queue depth, job
    execution, and backup success.
14. **Alerting.** Alert thresholds per signal, routing, escalation, and an
    explicitly defined on-call expectation. Alerts must be actionable; a noisy alert
    is a defect.
15. **Incident response.** Severity definitions, roles, communication procedure,
    containment steps for the security incidents in the Block 07 threat model, and a
    post-incident review requirement.
16. **OAuth environment validation.** Startup validation asserts that
    `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
    `GOOGLE_OAUTH_REDIRECT_URL`, and `SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED` are
    present and coherent when Google authentication is enabled, that the redirect URL
    matches the environment's public origin, and that the client secret is absent
    from any client-visible configuration. A mismatch fails the deployment rather
    than producing a broken login at runtime.

## Technical Requirements

- Infrastructure and pipeline configuration is version-controlled.
- Builds are reproducible; the release identifier is embedded and reported by the
  health endpoint and the error monitor.
- Environment differences are expressed as configuration, not as code branches.
- Secrets are injected from the platform secret store, never from the repository.

## Data Requirements

- Staging data is anonymised; no production personal data is copied to a lower
  environment.
- Backup retention satisfies the recovery point objective and the platform's
  retention policy.
- Restore rehearsals are logged with their date and measured recovery time.

## Security Requirements

- No secret is present in the repository, in build logs, or in client bundles.
- Production deployment requires explicit approval by an authorised human.
- The cron secret and webhook signing secret are per-environment and rotatable, with
  a documented rotation procedure.
- Access to production is least-privilege and audited.
- The pipeline fails closed: an inconclusive security scan blocks release.

## Accessibility Requirements

Post-deployment validation includes an accessibility smoke check on the deployed
environment, so a build that regresses accessibility is detected before promotion.

## Testing Requirements

- A pipeline test proving the gates fail the build on an introduced type error, a
  failing test, and a planted test secret.
- A rehearsed restore executed on staging with the recovery time recorded.
- A rehearsed rollback of application and functions.
- A test proving a missing or incoherent OAuth variable fails startup.
- A test proving a job endpoint rejects a request without the cron secret.
- Post-deploy smoke tests covering health, readiness, sign-in, a public report,
  search, and a citation export.

## Documentation Requirements

- `docs/deployment.md`: environments, the configuration matrix by variable and
  environment, the pipeline stages, the promotion path, and the release procedure.
- `docs/backup-recovery.md`: backup schedule, retention, the restore procedure, the
  recorded rehearsal results, and the objectives.
- `docs/incident-response.md`: severities, roles, communication, containment
  playbooks, and the post-incident review requirement.

## Acceptance Criteria

- [ ] All four environments are defined and reproducible.
- [ ] CI runs every gate on every pull request.
- [ ] Staging deploys automatically; production requires explicit approval.
- [ ] Migrations are rehearsed on staging before production.
- [ ] Edge Functions and the application deploy and roll back independently.
- [ ] Every scheduled job has a schedule, monitoring, and cron-secret protection.
- [ ] Backups run, are monitored, and a silent failure is detectable.
- [ ] A restore has been rehearsed with recovery time recorded.
- [ ] A rollback has been rehearsed.
- [ ] Monitoring and actionable alerting are configured for every listed signal.
- [ ] Incident response is documented with containment playbooks.
- [ ] OAuth environment validation fails deployment on a mismatch, proven by test.
- [ ] No secret exists in the repository, build logs, or client bundles.

## Completion Report

Report: environments configured, pipeline stages and gates, migration and rehearsal
procedure, function and application deployment mechanism, scheduled jobs with their
protections, backup schedule and monitoring, restore rehearsal date and measured
recovery time, rollback rehearsal result, monitoring signals and alert thresholds,
incident response coverage, OAuth validation evidence, secret handling verification,
and documentation written.
