"""
NADAC (National Average Drug Acquisition Cost) MCP Server
Provides drug pricing information from the CMS Medicaid NADAC dataset
"""

from fastmcp import FastMCP
import httpx
from typing import Optional

# Initialize FastMCP server
mcp = FastMCP("NADAC Drug Pricing")

# Base URL for NADAC API (Socrata Open Data API)
BASE_URL = "https://data.medicaid.gov/resource/a4y5-998d.json"

# Helper function to make API requests
async def query_nadac_api(params: dict) -> list:
    """Query the NADAC API with given parameters"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(BASE_URL, params=params)
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def get_drug_pricing(
    drug_name: Optional[str] = None,
    ndc: Optional[str] = None,
    limit: int = 10
) -> str:
    """
    Get current NADAC pricing for drugs by name or NDC.
    
    Args:
        drug_name: Drug name to search for (partial match)
        ndc: National Drug Code (exact match)
        limit: Maximum number of results (1-100, default 10)
    
    Returns:
        Drug pricing information including NDC, description, and NADAC per unit cost
    """
    if not drug_name and not ndc:
        return "Error: Must provide either drug_name or ndc"
    
    # Build SoQL query
    where_clauses = []
    if ndc:
        where_clauses.append(f"ndc='{ndc}'")
    if drug_name:
        where_clauses.append(f"ndc_description like '%{drug_name.upper()}%'")
    
    params = {
        "$limit": min(limit, 100),
        "$order": "effective_date DESC"
    }
    
    if where_clauses:
        params["$where"] = " AND ".join(where_clauses)
    
    try:
        results = await query_nadac_api(params)
        
        if not results:
            return f"No pricing data found for {'NDC: ' + ndc if ndc else 'drug: ' + drug_name}"
        
        output = []
        for item in results:
            output.append(f"""
NDC: {item.get('ndc', 'N/A')}
Drug: {item.get('ndc_description', 'N/A')}
NADAC Per Unit: ${item.get('nadac_per_unit', 'N/A')}
Pricing Unit: {item.get('pricing_unit', 'N/A')}
Effective Date: {item.get('effective_date', 'N/A')}
Classification: {item.get('classification_for_rate_setting', 'N/A')}
OTC: {item.get('otc', 'N/A')}
---""")
        
        return "\n".join(output)
    
    except Exception as e:
        return f"Error fetching pricing data: {str(e)}"


@mcp.tool()
async def compare_brand_generic(
    drug_name: str,
    limit: int = 10
) -> str:
    """
    Compare brand vs generic pricing for a drug.
    
    Args:
        drug_name: Drug name to search for
        limit: Maximum results per category (default 10)
    
    Returns:
        Comparison of brand and generic drug prices
    """
    try:
        # Get brand drugs
        brand_params = {
            "$where": f"ndc_description like '%{drug_name.upper()}%' AND classification_for_rate_setting like 'B%'",
            "$limit": limit,
            "$order": "nadac_per_unit DESC"
        }
        brand_results = await query_nadac_api(brand_params)
        
        # Get generic drugs
        generic_params = {
            "$where": f"ndc_description like '%{drug_name.upper()}%' AND classification_for_rate_setting = 'G'",
            "$limit": limit,
            "$order": "nadac_per_unit DESC"
        }
        generic_results = await query_nadac_api(generic_params)
        
        output = [f"Price Comparison for: {drug_name}\n"]
        
        if brand_results:
            output.append("BRAND DRUGS:")
            for item in brand_results:
                output.append(f"  • {item.get('ndc_description', 'N/A')}")
                output.append(f"    NDC: {item.get('ndc', 'N/A')}")
                output.append(f"    Price: ${item.get('nadac_per_unit', 'N/A')} per {item.get('pricing_unit', 'unit')}")
                output.append(f"    Effective: {item.get('effective_date', 'N/A')}\n")
        else:
            output.append("No brand drugs found\n")
        
        if generic_results:
            output.append("GENERIC DRUGS:")
            for item in generic_results:
                output.append(f"  • {item.get('ndc_description', 'N/A')}")
                output.append(f"    NDC: {item.get('ndc', 'N/A')}")
                output.append(f"    Price: ${item.get('nadac_per_unit', 'N/A')} per {item.get('pricing_unit', 'unit')}")
                output.append(f"    Effective: {item.get('effective_date', 'N/A')}\n")
        else:
            output.append("No generic drugs found\n")
        
        # Calculate savings if both exist
        if brand_results and generic_results:
            avg_brand = sum(float(item.get('nadac_per_unit', 0)) for item in brand_results) / len(brand_results)
            avg_generic = sum(float(item.get('nadac_per_unit', 0)) for item in generic_results) / len(generic_results)
            savings = ((avg_brand - avg_generic) / avg_brand * 100) if avg_brand > 0 else 0
            output.append(f"\nAverage Savings with Generic: {savings:.1f}%")
        
        return "\n".join(output)
    
    except Exception as e:
        return f"Error comparing prices: {str(e)}"


@mcp.tool()
async def get_price_history(
    ndc: str,
    limit: int = 20
) -> str:
    """
    Get historical pricing data for a specific NDC.
    
    Args:
        ndc: National Drug Code
        limit: Number of historical records (default 20)
    
    Returns:
        Historical pricing trend for the drug
    """
    try:
        params = {
            "$where": f"ndc='{ndc}'",
            "$order": "effective_date DESC",
            "$limit": limit
        }
        
        results = await query_nadac_api(params)
        
        if not results:
            return f"No historical data found for NDC: {ndc}"
        
        drug_name = results[0].get('ndc_description', 'Unknown')
        output = [f"Price History for: {drug_name} (NDC: {ndc})\n"]
        
        for item in results:
            output.append(f"Date: {item.get('effective_date', 'N/A')}")
            output.append(f"Price: ${item.get('nadac_per_unit', 'N/A')} per {item.get('pricing_unit', 'unit')}")
            output.append(f"Classification: {item.get('classification_for_rate_setting', 'N/A')}")
            output.append("---")
        
        # Calculate price trend
        if len(results) >= 2:
            oldest_price = float(results[-1].get('nadac_per_unit', 0))
            newest_price = float(results[0].get('nadac_per_unit', 0))
            if oldest_price > 0:
                change = ((newest_price - oldest_price) / oldest_price * 100)
                trend = "increased" if change > 0 else "decreased"
                output.append(f"\nPrice has {trend} by {abs(change):.1f}% over this period")
        
        return "\n".join(output)
    
    except Exception as e:
        return f"Error fetching price history: {str(e)}"


@mcp.tool()
async def search_by_ndc(
    ndc: str
) -> str:
    """
    Look up detailed information for a specific NDC.
    
    Args:
        ndc: National Drug Code (11-digit format)
    
    Returns:
        Complete drug information including current pricing
    """
    try:
        params = {
            "$where": f"ndc='{ndc}'",
            "$order": "effective_date DESC",
            "$limit": 1
        }
        
        results = await query_nadac_api(params)
        
        if not results:
            return f"No data found for NDC: {ndc}"
        
        item = results[0]
        
        return f"""
Drug Information for NDC: {ndc}

Drug Name: {item.get('ndc_description', 'N/A')}
Current NADAC Price: ${item.get('nadac_per_unit', 'N/A')}
Pricing Unit: {item.get('pricing_unit', 'N/A')}
Effective Date: {item.get('effective_date', 'N/A')}
As of Date: {item.get('as_of_date', 'N/A')}

Classification: {item.get('classification_for_rate_setting', 'N/A')}
Pharmacy Type: {item.get('pharmacy_type_indicator', 'N/A')}
OTC: {item.get('otc', 'N/A')}

Corresponding Generic NDC: {item.get('corresponding_generic_drug_nadac_per_unit', 'N/A')}
Corresponding Generic Price: ${item.get('corresponding_generic_drug_nadac_per_unit', 'N/A')}
"""
    
    except Exception as e:
        return f"Error looking up NDC: {str(e)}"
