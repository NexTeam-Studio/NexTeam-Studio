# Tenant versioned forms

Tenant forms are stored in `tenantForms`; submitted responses in `tenantFormResponses`; immutable response audit entries in `tenantFormAudit`.

Form fields are tenant-configurable and support text, number, boolean, select, multi-select, date, and media values. `visibleWhen` conditions control which fields are validated. Updating a form creates the next version; each response pins its `formVersion`.

Commands: create/revise forms (Owner or Office Admin); save/submit responses (Owner, Office Admin, Technician). Submitted responses cannot be changed. Responses can link client, property, job, visit, and NexDocs document IDs.

Events: the persisted audit stream records `created`, `updated`, and `submitted`, including actor, timestamp, and changed field keys.
