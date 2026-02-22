# Example VINE Files

Sample `.vine` files to explore in the Bacchus UI. Start the dev server, then drag any file onto the landing page — or use **File → Open**.

| File                      | What it shows                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `01-single-task.vine`     | The simplest graph — one node, no edges.                                                      |
| `02-linear-chain.vine`    | A straight-line dependency chain (5 tasks).                                                   |
| `03-diamond.vine`         | Two parallel branches merging into one task.                                                  |
| `04-all-statuses.vine`    | All 6 status keywords: complete, started, reviewing, notstarted, planning, blocked.           |
| `05-decisions.vine`       | Tasks annotated with `>` decision notes.                                                      |
| `06-project-bacchus.vine` | A realistic project graph with 13 tasks, including attachments — the Bacchus project itself.  |
| `07-design-system.vine`   | Child graph with `prefix` metadata — a v1.1.0 feature for namespaced task IDs.                |
| `08-nested-vine.vine`     | Parent graph using `ref` nodes to reference an external `.vine` file (v1.1.0).                |
| `09-ref-advanced.vine`    | Advanced multi-ref pattern with cross-dependencies and decisions on reference nodes (v1.1.0). |

## Loading in the UI

```powershell
yarn workspace @bacchus/ui dev
# open http://localhost:5173 and drag a .vine file onto the page
```

Or link directly: `http://localhost:5173/?file=<url-to-vine-file>`
