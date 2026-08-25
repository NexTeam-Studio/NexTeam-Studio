# NexTeam Design Hierarchy

Use these terms exactly for all design and frontend work.

1. **Page** — one specific screen, such as Clients list or a Quote detail view.
2. **Page Template** — the layout and skeleton of a Page. It defines where the Header Layout Part, Sidebar Layout Part, and main content area appear.
3. **Layout Part** — a reusable piece used to build a Page Template, such as a header or sidebar.
4. **Component** — a smaller piece used to build a Layout Part, such as a button, text field, or icon.

## Verbatim copy rule

When an instruction says to copy, duplicate, or make one thing identical to another, the first action must be a literal, file-level duplication of the source — not a reimplementation using existing wrappers, structures, or "equivalent" values.

Only the specifically named differences (for example, the text label) may be changed. No other value, structure, or DOM difference is permitted unless explicitly requested.

If following this exactly would break, conflict with, or require removing existing functionality, stop before writing any code and report the conflict for a decision. Do not silently choose which priority wins.

Before reporting any "verbatim" or "identical" task as done, provide a rendered comparison (screenshot or DOM diff) of the original and the copy side by side. A verbal claim of "matches" is not sufficient evidence for this category of task.
