# MCP Healthcare Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that bundles healthcare data tools for use with Claude Desktop, Cursor, and other MCP clients.

## Tools (10 total)

### ICD-10-CM Diagnosis Codes (74,260 codes from CMS 2025)

| Tool | Description |
|------|-------------|
| `icd10_lookup` | Look up an ICD-10-CM code by code string (e.g., `E11.9`) |
| `icd10_search` | Search codes by keyword (e.g., "diabetes", "chest pain") |
| `icd10_validate` | Check if a code exists in the 2025 code set |

### NPI Provider Registry (live NPPES queries)

| Tool | Description |
|------|-------------|
| `npi_search` | Search providers by name, specialty, city, state, ZIP |
| `npi_lookup` | Look up a provider by 10-digit NPI number |

### NDC Drug Directory (111,655 FDA products)

| Tool | Description |
|------|-------------|
| `ndc_lookup` | Look up a drug by NDC code (e.g., `0002-1433-80`) |
| `ndc_search` | Search drugs by name, generic name, or manufacturer |
| `ndc_search_ingredient` | Search drugs by active ingredient |

### DEA Number Validation (algorithm-based)

| Tool | Description |
|------|-------------|
| `dea_validate` | Validate a DEA number using the official checksum algorithm |
| `dea_generate_test` | Generate a valid test DEA number for development |

## Setup

### Prerequisites

- Node.js 18+
- The ICD-10 and NDC data files from sibling API directories

### Install

```bash
cd mcp-healthcare
npm install
npm run link-data   # creates symlinks to ICD-10 and NDC data files
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "healthcare": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-healthcare/src/index.js"]
    }
  }
}
```

### Cursor Configuration

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "healthcare": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-healthcare/src/index.js"]
    }
  }
}
```

## Data Sources

| Dataset | Source | Update Frequency |
|---------|--------|-----------------|
| ICD-10-CM | CMS (Centers for Medicare & Medicaid) | Annually (October) |
| NDC | FDA National Drug Code Directory | Weekly |
| NPI | NPPES Registry (live API) | Real-time |
| DEA | Checksum algorithm (no dataset) | N/A |

## Transport

This server uses **stdio transport** (stdin/stdout), which is the standard for local MCP integrations with Claude Desktop and Cursor. No HTTP server is started.

## Architecture

The server imports pure business logic extracted from four Express-based REST APIs:

- `src/tools/icd10.js` — ICD-10 code lookup, search, validation (loads 6MB JSON dataset)
- `src/tools/ndc.js` — NDC drug lookup and search (loads 53MB JSON dataset)
- `src/tools/npi.js` — NPI provider search via live NPPES API
- `src/tools/dea.js` — DEA number validation (pure algorithm, no dataset)

Data files are symlinked from sibling API directories to avoid duplication.
