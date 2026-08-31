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

### Scope of this rule

The Verbatim Copy Rule applies only to the specific action explicitly requested as a copy, duplication, or identical match. It prevents silent reinterpretation during that action; it does not permanently lock the resulting files together.

Once the duplicated component exists as its own separate file, it is independent. Future normal edits to that component do not require re-duplication, comparison against the original, or changes to the original. For example, a later edit to `NexSuiteHeader` does not require touching or re-verifying `NexCommandHeader` unless a future instruction explicitly requests another copy or identical-match task.

## Templates review completion rule

Every new **Layout Part** or **Page Template** must be added to the NexCommand review area at `Templates → Design → NexSuite → Global` before its task is reported complete. The review entry must link directly to a Page that renders the current real implementation, not a stale or substitute reference, and the Page must show the literal source filename at its top. Internal **Components** do not receive separate review Pages unless explicitly requested.
