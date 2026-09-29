# Service Traceability

<img width="1843" height="988" alt="image" src="https://github.com/user-attachments/assets/c77ac647-8b6e-4eb7-9172-c88f01aceaa2" />


Accelerate your Full Gen3 migration by identifying configurations impacted by Gen3 Service Detection breaking changes. Service Traceability helps you understand dependencies, assess migration impact, and confidently enable SDv1 Enhancement Endpoints and SDv2 Service Detection.

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
| Service Traceability policy |`automation:workflows:read`,`automation:workflows:run`<br>`app-engine:apps:run`,`app-engine:functions:run`<br>`settings:objects:read`,`slo:slos:read`<br>`document:documents:read`,`document:documents:admin`<br>`storage:files:read WHERE storage:file-path startsWith "/lookups/scanner-service-configuration"`<br>`storage:files:write WHERE storage:file-path startsWith "/lookups/scanner-service-configuration"` | 
| Service Traceability user group | `Service Traceability` policy |
| Custom App deployment | `app-engine:apps:run`<br>`app-engine:apps:install` |
| to use Custom App | `standard user`, `storage:files:read WHERE storage:file-path startsWith "/lookups/scanner-service-configuration"` | 	

| Service User  | User Group |
|-------------|-------|
| Service Traceability | `Service Traceability` user group |
---

## Installation

### Step 1 — Deploy the App

```bash
git clone https://github.com/dynatrace-ace-services/service-traceability.git
cd service-traceability
```

```bash
# Install dependencies:
npm install
```

```bash
# Ensure your Node.js and npm versions match the prerequisites above:
node -v
npm -v
```

```bash
# If you encounter dependency issues after installation or update:
rm -rf node_modules package-lock.json
npm install
```

```bash
# Edit the target environment URL if needed
# [!IMPORTANT] app.config.json > "environmentUrl": "https://<your-env>.apps.dynatrace.com/"
```

```bash
# Build and deploy:
npm run deploy
```

```bash
# more details [here](https://developer.dynatrace.com/quickstart/app-toolkit/)
# [!NOTE] "You will be prompted to approve the required scopes on the first install"
```

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

#### Scan Scope Notes

**Dashboard scans:** Untitled dashboards are intentionally excluded from the scan and are not reported in the results. This is by design to avoid reporting temporary or draft objects.

**Notebook scans:** Untitled notebooks are intentionally excluded from the scan and are not reported in the results. This is by design to avoid reporting temporary or draft objects.

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

## Troubleshooting

**"No data — run a scan first"** — The lookup tables are empty. Run a scan by clicking **Scan Configurations**.

**Workflow fails with 400 / scope error** — Verify that the OAuth2 client has all scopes listed in section B. Check that the service user is assigned as the workflow actor.

**0 results for a category** — The workflow writes a sentinel record when a category returns zero results. Check the workflow execution logs in Dynatrace Automations for errors on that category.

**OpenPipeline returns 0 results** — The workflow queries the Settings API using `builtin:openpipeline.*` schemas. Verify that the OAuth2 client has `settings:objects:read` and that OpenPipeline rules exist in the environment.


**Version shown in About panel does not match** — The version displayed is the `APP_VERSION` constant in `ui/app/pages/Scanner.tsx`. It must match `app.config.json` and `package.json`.

---

## Repository

- GitHub: https://github.com/dynatrace-ace-services/service-traceability
- Documentation: https://docs.dynatrace.com/docs/observe/application-observability/services/service-detection
