# VHS Demo for todos.md
# Shows: 1) It's just markdown  2) CLI queries  3) Interactive TUI

Output demo.gif

Set Shell "bash"
Set FontSize 13
Set Width 1200
Set Height 700
Set Padding 20
Set TypingSpeed 40ms
Set WindowBar Colorful
Set WindowBarSize 40

# First, show it's just a markdown file
Type "# Your todos are just markdown files"
Enter
Sleep 1s

Type "cat todos.md | head -30"
Enter
Sleep 3s

# Show CLI query commands
Type "clear"
Enter
Sleep 300ms

Type "# Query with tmd list"
Enter
Sleep 800ms

Type "tmd list bucket:today"
Enter
Sleep 2500ms

Type "tmd list energy:low status:open"
Enter
Sleep 2500ms

Type "tmd list area:work priority:high"
Enter
Sleep 2500ms

# Launch TUI
Type "clear"
Enter
Sleep 300ms

Type "# Or use the interactive TUI"
Enter
Sleep 800ms

Type "tmd interactive"
Enter
Sleep 2500ms

# Navigate down
Type "j"
Sleep 250ms
Type "j"
Sleep 250ms
Type "j"
Sleep 250ms

# Expand task with subtasks
Type "l"
Sleep 1200ms

# Switch views
Type "2"
Sleep 1500ms

Type "3"
Sleep 1500ms

Type "9"
Sleep 1500ms

Type "1"
Sleep 1500ms

# Quit
Type "q"
Sleep 500ms
