# VHS Demo for todos.md
# Shows: 1) It's just markdown  2) Interactive TUI

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

Type "cat todos.md | head -35"
Enter
Sleep 4s

# Clear and launch TUI
Type "clear"
Enter
Sleep 500ms

Type "# Query and manage with tmd"
Enter
Sleep 1s

Type "tmd interactive"
Enter
Sleep 3s

# Navigate down
Type "j"
Sleep 300ms
Type "j"
Sleep 300ms
Type "j"
Sleep 300ms

# Expand task with subtasks
Type "l"
Sleep 1500ms

# Switch to Upcoming view
Type "2"
Sleep 2s

# Switch to All Open
Type "3"
Sleep 2s

# Switch to Low Energy custom view
Type "9"
Sleep 2s

# Back to Today
Type "1"
Sleep 2s

# Quit
Type "q"
Sleep 500ms
