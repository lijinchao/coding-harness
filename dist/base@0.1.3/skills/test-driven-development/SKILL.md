---
name: test-driven-development
description: Use before writing implementation code for a behavior change.
---

# Test-driven development

## Inputs

- The next behavior to implement, small enough for one failing test.
- The test file that will carry it.

## Steps

1. Write one failing test for the next behavior.
2. Run it and confirm it fails for the expected reason.
3. Write the smallest change that makes it pass.
4. Run the test and confirm it passes.
5. Refactor with the test green.
6. Commit the test with the change.

## Verification

The test failed before the change and passes after it, and the full suite is green.

## Failure

- A test that passes before the change was not run against the old code. Rewrite it.
- Code written before its test is deleted, not kept.
- Never weaken a test to make it pass. Fix the code, or change the behavior deliberately and update the test in a separate, reviewed change.
