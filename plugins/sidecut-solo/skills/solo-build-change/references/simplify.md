# Simplify the diff

Read this after the change works and before the full checks and review. Shrink what the reviewer has to read without changing behavior.

Remove each of these from your own diff:

- Code nothing calls, and leftovers from approaches you dropped: debug output, commented-out code, unused imports and parameters.
- An abstraction with one caller. Inline it unless the repository already uses that pattern in this area.
- An option, flag or extension point nobody asked for.
- A comment that restates the next line. Keep comments that say why.
- A defensive check for a state the types or callers already rule out.
- A change outside the task, such as renames, reformatting or drive-by refactors. Note those for later instead.

Rerun the focused checks after simplifying. If a removal changes behavior, it wasn't a simplification: put it back.

Leave other people's code as it is, even when it could be simpler.
