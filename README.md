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
│  ┌──────────────────────────────────────────────────────┐   │
│  │  UI  (Strato Design System)                          │   │
│  │  - Scanner page: toolbar, stats, per-category tables │   │
│  │  - Services section: live SDv / key-request view     │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Workflow (Dynatrace Automation)                     │   │
│  │  - JS task: scan_filters                             │   │
│  │  - Reads all configs via OAuth2 Client Credentials   │   │
│  │  - Extracts filter expressions from each config      │   │
│  │  - Writes results to Grail lookup tables             │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Grail Lookup Tables (storage)                       │   │
│  │  - One lookup table per configuration type           │   │
│  │  - Summary table for scan statistics                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

```

## Prerequisites

| Component | Requirement |
|------------|------------|
| Node.js | 22.x or later |
| npm | 10.x or later |
| Git | Required |
|Extension Dynatrace App Toolkit | Required for application deployment in your IDE |

| Permission  | scopes |
|-------------|-------|
| Component | Permissions |
| Service Traceability policy |`credential-vault:entries:read`,`environment-api:credentials:write`<br>`environment:roles:viewer`,`environment-api:credentials:read`<br>`automation:workflows:read`,`automation:workflows:run`<br>`app-engine:apps:run`,`app-engine:functions:run`<br>`storage:files:read WHERE storage:file-path "startsWith/lookups/scanner-service-configuration"`<br>`storage:files:write WHERE storage:file-path startsWith "/lookups/scanner-service-configuration"` | 
| Service Traceability user group | `Service Traceability policy` |
| OAuth 2.0 Client |`settings:objects:read`<br>`document:documents:read`,`document:documents:admin`<br>`slo:slos:read`,`automation:workflows:read`<br>`storage:files:read,storage:files:write` |
| Custom App deployment | `app-engine:apps:run`<br>`app-engine:apps:install` |
| Custom App | `Service Traceability user group`,`standard user`| 	


| Settings | Requirement |
|------------|------------|
| External requests (outbound connections) | `api.dynatrace.com` |

| Service User  | User Group |
|-------------|-------|
| Service Availability | `Service Traceability user group` |
---

## Installation

### Step 1 — Deploy the App

```bash
git clone https://github.com/dynatrace-ace-services/service-traceability.git
cd service-traceability

# Install dependencies
npm install

# Edit the target environment URL if needed
# app.config.json > "environmentUrl": "https://<your-env>.apps.dynatrace.com/"

# Build and deploy
npm run deploy

# more details [here](https://developer.dynatrace.com/quickstart/app-toolkit/)
```

You will be prompted to approve the required scopes on the first install.

---

### Step 2 — Import the Workflow

The app discovers the workflow by its exact title **`Service Traceability`**.

**Option A — Dynatrace UI:**

1. Open your Dynatrace environment → **Automations** → **Workflows**
2. Click **⋮** → **Import** → select `workflow/service-traceability.workflow.json`
3. Confirm the title is `Service Traceability`

**Option B — `dtctl` CLI (WSL / macOS / Linux):**

```bash
dtctl workflow apply -f workflow/service-traceability.workflow.json
```

### Step 3 — Add Service User
- **Workflow** - Use this service user as the actor for the  `Service Traceability` workflow

- **Vault** – After completing the steps in the [First Use](#first-use) section and saving the credentials, grant this service user access to the vault `scanner-service-configuration-`

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
