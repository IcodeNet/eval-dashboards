---
name: plain-english-prs
description: Write or update pull request descriptions for eval-dashboards using its repository template, plain English, concrete examples, and observed before-and-after evidence.
---

# Plain-English pull requests

Read `.github/pull_request_template.md` from the repository root and use its
seven sections. It is the source of truth for the structure; do not keep a
second template in this skill. Apply the repo's conventional title format.

Write for a human reviewer who has not read the chat:

- Start with the problem and who experiences it. Use one concrete example
  consistently in the problem, before/after behavior, and evidence sections.
- Use familiar words and short, direct sentences. Explain necessary technical
  terms once. Prefer “matching test cases” to unexplained shorthand such as
  “cohort eligibility”; retain exact field/command names when needed to use it.
- Explain why the result is useful, along with material limits or trade-offs.
  Describe the final change rather than the conversation or abandoned plans.
- Separate observed results, code inspection, and expectations. Record the
  revision and input for a before/after replay. Never turn added test counts
  into a performance claim, or invent an old measurement. If a baseline was
  not run, say so and explain what evidence is available.
- Give a copyable command or the ordinary workflow. Name config changes,
  migrations, or changed defaults that the user needs to know.
- Keep every section concise. If one does not apply, give the reason instead
  of filling it with generic text. Scale the detail to the change.

Use reviewer feedback to improve the versioned template and this guidance when
it exposes a recurring misunderstanding. Prefer narrow, useful edits over an
accumulating checklist. Changes to the template are reviewed like other repo
changes. Drafting a description does not itself authorize publishing it or
changing a pull request; use the authorization already provided for the task.
