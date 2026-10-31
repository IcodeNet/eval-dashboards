# Generate from this directory: cd docs/tutorials/vhs && vhs demo.tape
# Requires VHS (including its browser/FFmpeg dependencies), Node.js >=22.22,
# npm, and registry access. Installation time depends on the connection.
# Outputs and the reusable .tmp/vhs-demo workspace are ignored by Git.
# This records the published npm package; it does not test the local branch.

Output demo.gif
Output demo.mp4

Require node
Require npm
Require npx

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 700
Set Padding 25
Set Theme "Catppuccin Mocha"
Set WindowBar "Colorful"
Set BorderRadius 10
Set TypingSpeed 60ms

Sleep 1s

# Step 1: Set up a workspace with an existing, versioned sample artifact.
Type "cd ../../.."
Enter
Type "mkdir -p .tmp/vhs-demo/.evals_output"
Enter
Sleep 1s
Type "cp examples/basic-json/run-001.json .tmp/vhs-demo/.evals_output/eval-report.json"
Enter
Type "cd .tmp/vhs-demo"
Enter
Sleep 1s

# Step 2: Isolate npm from the surrounding repository, then install.
Type "npm init -y > /dev/null"
Enter
Sleep 1s
Type "npm install @icodenet/eval-dashboards"
Enter
# VHS waits for this minimum duration, not for installation completion.
# Increase it for a cold cache or slower registry before recording.
Sleep 12s

# Step 3: Inspect the sample report.
Type "ls -lh .evals_output/eval-report.json"
Enter
Sleep 1.5s

# Step 4: Generate a static HTML dashboard using the supported report command.
Type "npx eval-dashboards report --input=./.evals_output --reporter=html --report-dir=./public/eval-dashboard"
Enter
Sleep 3s

# Step 5: Inspect generated artifacts.
Type "ls -lh ./public/eval-dashboard"
Enter
Sleep 2s

# Step 6: Confirm only when the expected HTML artifact exists.
Type "test -s ./public/eval-dashboard/index.html && echo 'Dashboard compiled successfully to ./public/eval-dashboard/index.html'"
Enter
Sleep 3s
