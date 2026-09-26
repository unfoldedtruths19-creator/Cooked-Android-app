# Archived migration files (NOT applied, NOT run by the CLI)

The remote database history is: 0001, 0002 (delete_user_function), 0003, 20260821.
These files were written against a schema that never existed on the remote
(summary_date / session_fingerprint / local_date) or replaced applied files with
different content. They are kept only for reference. Their intent is folded into
`../migrations/20260924120000_repair_schema_and_focus_lifecycle.sql`.
