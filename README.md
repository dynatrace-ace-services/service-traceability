# Service Traceability

**Version:** 0.0.0

A Dynatrace Custom App that discovers where services and key requests are referenced across Dynatrace configurations (dashboards, notebooks, workflows, anomaly-detection rules, SLOs, SRE Guardians, and OpenPipeline rules). It helps teams understand service dependencies and supports SDv1 → SDv2 migration efforts.

---

## Application Purpose

Service Traceability scans Gen 3 Dynatrace configurations and identifies which configurations reference specific services or key requests — by service ID, service name, classic service name, key request ID, or key request name. Results are displayed in the app UI and can be exported to CSV.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Dynatrace AppEngine (TypeScript/React)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UI  (Strato Design System)                          │  │
│  │  - Scanner page: toolbar, stats, per-category tables │  │
│  │  - Services section: live SDv / key-request view     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Workflow (Dynatrace Automation)                      │  │
│  │  - JS task: scan_filters                             │  │
│  │  - Reads all configs via OAuth2 Client Credentials   │  │
│  │  - Extracts filter expressions from each config      │  │
│  │  - Writes results to Grail lookup tables             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Grail Lookup Tables (storage)                       │  │
│  │  - One lookup table per configuration type           │  │
│  │  - Summary table for scan statistics                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

The app UI reads lookup tables via DQL, joins with live Smartscape data to resolve service names and SDv, and performs client-side filter matching.

---

## Prerequisites

- Dynatrace SaaS environment (Gen 3 / Grail)
- Dynatrace App Toolkit (`dt-app`) installed globally or as a dev dependency
- Node.js ≥ 20.19.0
- An OAuth2 Client Credentials grant in the environment (for the workflow)
- A Dynatrace service user to act as the workflow actor

---

## Local Development Requirements

```bash
npm install        # Install dependencies
npm run start      # Start dev server with hot reload (optionnal)
npm run build      # Production build (optionnal)
npm run lint       # ESLint check (optionnal)
npm run deploy     # Build and deploy to the configured environment (optionnal)
```

The `environmentUrl` in `app.config.json` must point to your Dynatrace environment.

---

## Permissions

### A. Custom App Deployment Permissions

The Dynatrace user deploying the app needs:

| Permission | Purpose |
|---|---|
| `app-engine:apps:run` | Run the app in AppEngine |
| `app-engine:apps:install` | Install the app |

### B. Workflow OAuth2 Client Credentials Scopes

The OAuth2 client used by the workflow service user requires:

| Scope | Purpose |
|---|---|
| `settings:objects:read` | Read anomaly detection rules, SLOs, SRE Guardians, OpenPipeline schemas |
| `document:documents:read` | Read dashboards and notebooks |
| `document:documents:admin` | Read all documents (not only own) |
| `slo:slos:read` | Read SLO definitions |
| `automation:workflows:read` | Read workflow definitions |
| `storage:files:read` | Read existing lookup table files |
| `storage:files:write` | Write scan results to lookup tables |

### C. Application Scopes

The app itself (declared in `app.config.json`) requires:

| Scope | Purpose |
|---|---|
| `state:user-app-states:read` | Read persisted vault config |
| `state:user-app-states:write` | Persist vault config |
| `automation:workflows:read` | Discover the scanner workflow |
| `automation:workflows:run` | Trigger the scanner workflow |
| `environment-api:credentials:read` | List credential vault entries |
| `environment-api:credentials:write` | Create/update OAuth2 vault entry |
| `storage:buckets:read` | Query lookup tables via DQL |
| `storage:files:read` | Read lookup table files |
| `storage:files:write` | Write scan results to lookup tables |
| `settings:objects:read` | Read Settings API objects |
| `storage:entities:read` | Query Smartscape entity data via DQL |
| `storage:filter-segments:read` | Read filter segments for the SegmentSelector |
| `storage:smartscape:read` | Query smartscapeNodes via DQL |

---

## Workflow Installation

### Method 1 — Dynatrace UI

1. Open **Automations** in your Dynatrace environment.
2. Click **Import workflow**.
3. Select `workflow/service-traceability.workflow.json` from this repository.
4. Save the workflow.

### Method 2 — dtctl CLI

```bash
dtctl apply -f workflow/service-radar.workflow.json
```

---

## Service User Configuration

The workflow runs as a Dynatrace service user (technical user). This user must:

1. **Have an OAuth2 Client Credentials grant** with all scopes listed in section B above.
2. **Be assigned as the workflow actor** in the workflow settings (Automation > your workflow > Actor).
3. **Have access to the Credential Vault entry** used by the app (the entry created when you click "Set Credentials" in the app UI). Grant the service user read access to that vault entry.

The service user does not require interactive login; only the OAuth2 grant and vault access are needed.

---

## Credential Vault Configuration

The app stores the OAuth2 client credentials in the Dynatrace Credential Vault:

1. Open the app and click **Set Credentials**.
2. Enter the OAuth2 Client ID and Client Secret for your service user.
3. The app creates or updates a vault entry named `scanner-service-configuration-<env>`.
4. The workflow reads credentials from this vault entry at runtime.

---

## Initial Application Setup

1. Deploy the app: `npm run deploy`
2. Import the workflow (see Workflow Installation above).
3. Assign the service user as the workflow actor.
4. Open the app, click **Set Credentials**, and save the OAuth2 client credentials.
5. Click **Scan Configurations** to run the first scan.

---

## First Use

After the first scan completes, the app displays:

- **Services** — all detected Gen 3 services, enriched with SDv version, classic name, and key requests.
- **Per-category tables** — configurations that reference services via filter expressions.

Subsequent scans update the lookup tables and refresh the displayed data.

---

## Features

### Configuration-Type Enable / Disable

Each configuration type (dashboard, notebook, anomaly-detection, SLO, SRE Guardian, OpenPipeline, workflow) has an **Enabled / Disabled** toggle in its section header. Disabled categories are skipped by the workflow at scan time. If all categories are disabled, the **Scan Configurations** button is disabled.

### Scan Execution

Click **Scan Configurations** to trigger the automation workflow. The workflow:
1. Reads all configurations for each enabled category via the OAuth2 service user.
2. Extracts filter expressions referencing services or key requests.
3. Writes results to Grail lookup tables.
4. Updates the per-category summary.

The app polls for workflow completion and refreshes data automatically.

### SDv1 / SDv2 Segments

Toggle the **SDv1** and **SDv2** pills in the toolbar to show or hide services by detection version. Both are active by default.

### Service and Key Request Filters

Use the **search field** in the toolbar to filter rows by service name, classic name, service ID, key request ID, or key request name. The filter applies to all sections simultaneously.

### Time-Range Selection

Use the **24h / 7d / 30d** pills to control the Smartscape lookback window. This affects which services are returned by DQL. It does not affect the workflow scan itself.

### CSV Export

Click **Export CSV** to download all currently visible match rows as a CSV file named `service-traceability-YYYY-MM-DD.csv`. The export includes configuration type, names, IDs, SDv version, key requests, and the matched filter expression.

---

## Lookup-Table Storage

The workflow writes results to Grail lookup tables under the path prefix `/lookups/scanner-service-configuration/`:

| Category | Lookup path |
|---|---|
| dashboard | `/lookups/scanner-service-configuration/dashboard` |
| notebook | `/lookups/scanner-service-configuration/notebook` |
| anomaly-detection | `/lookups/scanner-service-configuration/anomaly-detection` |
| slo | `/lookups/scanner-service-configuration/slo` |
| sre | `/lookups/scanner-service-configuration/sre` |
| openpipeline | `/lookups/scanner-service-configuration/openpipeline` |
| workflow | `/lookups/scanner-service-configuration/workflow` |
| summary | `/lookups/scanner-service-configuration/summary` |

Filter-expression lookup tables (used for client-side matching) use the prefix `/lookups/scanner-service-configuration/filter-<category>`.

---

## Development Commands

| Command | Description |
|---|---|
| `npm run start` | Start dev server with hot reload |
| `npm run build` | Compile and bundle the app |
| `npm run deploy` | Build and deploy to the configured environment |
| `npm run lint` | Run ESLint |
| `npm run info` | Show app info |

---

## Security Notes

- OAuth2 client credentials are stored in the Dynatrace Credential Vault, never in source code or environment files.
- The app never logs or exposes credentials.
- ESLint is configured with `eslint-plugin-no-secrets` to prevent accidental credential commits.
- The `no-eval` rule is enforced; dynamic code execution is forbidden.

---

## Troubleshooting

**"No data — run a scan first"** — The lookup tables are empty. Run a scan by clicking **Scan Configurations**.

**Workflow fails with 400 / scope error** — Verify that the OAuth2 client has all scopes listed in section B. Check that the service user is assigned as the workflow actor.

**0 results for a category** — The workflow writes a sentinel record when a category returns zero results. Check the workflow execution logs in Dynatrace Automations for errors on that category.

**OpenPipeline returns 0 results** — The workflow queries the Settings API using `builtin:openpipeline.*` schemas. Verify that the OAuth2 client has `settings:objects:read` and that OpenPipeline rules exist in the environment.

**Credentials panel shows an error** — Ensure `environment-api:credentials:read` and `environment-api:credentials:write` are granted to the app deployment user.

**Version shown in About panel does not match** — The version displayed is the `APP_VERSION` constant in `ui/app/pages/Scanner.tsx`. It must match `app.config.json` and `package.json`.

---

## Repository

- GitHub: https://github.com/dynatrace-ace-services/service-traceability
- Documentation: https://docs.dynatrace.com/docs/observe/application-observability/services/service-detection
