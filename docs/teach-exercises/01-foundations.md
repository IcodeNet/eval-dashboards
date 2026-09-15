# Exercise 01: Foundations (plain language)

What this exercise teaches
1. An eval starts as a plain-English claim, not a JSON file.
2. If you can't state failure concretely, you can't build a useful eval.

Question this answers
- What real behavior are we protecting, and what does failure look like in production?

Goal
- Describe one real behavior you care about.
- Describe what failure means in production.

Prerequisite
- Complete setup in `docs/teach-curriculum.md` section "Exercise rules".

Why this matters
- If you cannot define failure, you cannot build a useful eval.
- This is the start of every good eval program.

Before you start
- Open your project root in terminal.

Steps
1) Create a notes file.

```sh
mkdir -p eval/notes
cat > eval/notes/01-foundations.md <<'EOF'
Behavior under test: grounded support answers that cite policy docs.
Failure in production: assistant gives an answer with no source support and causes incorrect customer action.
EOF
```

2) Read the file and check it is clear.

```sh
cat eval/notes/01-foundations.md
```

Example result

```md
Behavior under test: grounded support answers that cite policy docs.
Failure in production: assistant gives an answer with no source support and causes incorrect customer action.
```

Definition of done
- You can explain the behavior in one sentence.
- You can explain failure in one sentence.
- Another teammate can read both lines and understand them quickly.

If you get stuck
- Keep the behavior narrow (one user task, not many).
- Keep failure concrete (what bad outcome happens).

Common mistakes
- Writing a behavior so broad it covers the whole product ("the assistant should be good") instead of one narrow user task.
- Describing failure as a code error ("it crashed") instead of a business outcome (what the user or company loses).