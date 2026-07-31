# Testing Rules

## Tests accompany changes

1. A functional change ships with its tests in the same change. Tests are not a
   follow-up block.
2. New behaviour gets a test proving it works. Changed behaviour gets its test
   updated, not deleted.
3. A block is not complete while any test it introduced or touched is failing.

## Security testing

4. **Denied-access tests are mandatory.** For every authorization boundary — relation,
   storage object, route, server action, API endpoint, search result, administrative
   mutation — a test asserts the unauthorised actor is refused.
5. A boundary tested only on its permitted path is untested.
6. Maintain the meta-test that fails when a new table in an exposed schema has no RLS
   and no denial test.
7. **Never weaken, disable, or bypass a control to make a test pass.** A test that
   requires disabling RLS, elevating a role, or removing a gate is invalid. Fix the
   test or fix the design.
8. Verify that tests have teeth: invert a control locally and confirm its test fails,
   then restore.

## Regression

9. Every defect gets a regression test that fails before the fix and passes after.
10. Never delete a failing test to make a suite green. Fix it, or record the skip with
    a reason and an owner.

## Determinism

11. No test depends on wall-clock timing, network access to a third party, or
    execution order.
12. Fixtures are seeded reproducibly and reset between runs.
13. Fake external providers at the Block 03 abstraction boundary, never by patching
    internals.
14. Test data contains no real personal data and no production extract.
15. Test credentials are generated per run and never committed.

## Coverage

16. Fixtures cover every content lifecycle state and every role.
17. Every Must-requirement in the traceability register links to at least one test.
18. Record known coverage gaps explicitly rather than implying full coverage.

## Gates

19. The build fails on: type errors, lint errors, build failure, a detected secret, a
    dependency finding above the threshold, an accessibility failure, and a ranking
    regression below the recorded threshold.
20. Do not lower a threshold to make a build green. Raise the code to the threshold or
    escalate.
21. A suite with skipped tests is not green unless every skip has a recorded reason.
22. Report test results honestly, including the failing output. Never describe a red
    suite as green.
