# NADAC MCP Server

Model Context Protocol (MCP) server for accessing National Average Drug Acquisition Cost (NADAC) data from CMS Medicaid.

## Overview

This MCP server provides tools to query drug pricing information from the NADAC dataset, which contains national average acquisition costs for prescription drugs as reported by pharmacies.

## Data Source

- **API**: Socrata Open Data API (SODA)
- **Endpoint**: `https://data.medicaid.gov/resource/a4y5-998d.json`
- **Dataset**: NADAC (National Average Drug Acquisition Cost) weekly reference data
- **Provider**: Centers for Medicare & Medicaid Services (CMS)

## Available Tools

### 1. get_drug_pricing
Get current NADAC pricing for drugs by name or NDC.

**Parameters:**
- `drug_name` (optional): Drug name to search for (partial match)
- `ndc` (optional): National Drug Code (exact match)
- `limit` (optional): Maximum number of results (1-100, default 10)

### 2. compare_brand_generic
Compare brand vs generic pricing for a drug.

**Parameters:**
- `drug_name`: Drug name to search for
- `limit` (optional): Maximum results per category (default 10)

### 3. get_price_history
Get historical pricing data for a specific NDC.

**Parameters:**
- `ndc`: National Drug Code
- `limit` (optional): Number of historical records (default 20)

### 4. search_by_ndc
Look up detailed information for a specific NDC.

**Parameters:**
- `ndc`: National Drug Code (11-digit format)

## Deployment

This server is designed to run on Google Cloud Run with FastMCP streamable HTTP transport.

### Connection URL
For Claude.ai web integration:
```
https://[your-service-url]/mcp
```

## Example Queries

- "What's the current NADAC price for atorvastatin?"
- "Compare brand vs generic pricing for metformin"
- "Show me price history for NDC 00093310105"
- "Look up NDC 00406879101"

## About NADAC

The National Average Drug Acquisition Cost (NADAC) represents the average cost that pharmacies pay to acquire drugs from wholesalers and distributors. It's based on monthly surveys of over 60,000 pharmacies across all 50 states and Washington D.C.

Key fields:
- **NDC**: National Drug Code (unique identifier)
- **NDC Description**: Drug name, strength, and dosage form
- **NADAC Per Unit**: Cost per pricing unit
- **Pricing Unit**: ML (Milliliter), GM (Gram), or EA (Each)
- **Classification**: Brand (B) or Generic (G)
- **Effective Date**: Date the price became effective

## License

This server accesses public domain data from CMS.
