# Introduction

This project is to build a mobile friendly app that help the user to learn French by shadowing technique: listen and repeat the sentence.

Read `docs/app-spec.md` for an overview of the project.

Read `docs/content-decision.md` for the agreed design for the lesson content (how long is the sentece, what speed,...).

Read `docs/prototype-plan.md` for the tasks to work toward the current goal: have a first working prototype.

# Guideline

- Each task must be done in it's own branch. When a task is done (concluded by the user or meet the finish condition), then the user will merge the code from that branch into `main` branch and the agent must not continue using that branch.

# Development flow

Two stages:

1. **Develop:** run `npm run dev` in `app/` and open it on the phone through the `cloudflared` tunnel (`cloudflared tunnel --url http://localhost:5173`). Use the browser (Opera Touch), not the home-screen app, because the tunnel URL changes each time. The dev build has the settings panel and fast reloads, and nothing is public.
2. **Release:** the user merges the task branch into `main`. If `app/`, `content/build/` or the workflow file changed, GitHub Actions deploys to https://nhv96.github.io/moles/. Docs-only merges do not deploy.

Rules:
- Test a feature with the tunnel before merging. Do not use `main` and the deployed app as the test bed.
- Things that only behave right when installed (screen locked, home-screen app, long runs) get a final check on the deployed app after the merge.
- Every pull request runs lint, format check, tests and the build. Run `npm run lint`, `npm run format:check` and `npm test` in `app/` before asking the user to commit.
