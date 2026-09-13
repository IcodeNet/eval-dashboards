# Exercise 01: Foundations (plain language)

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