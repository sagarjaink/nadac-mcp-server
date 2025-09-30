#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';

class NADACServer {
  constructor() {
    this.server = new Server(
      {
        name: 'nadac-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.baseURL = 'https://data.medicaid.gov/api/1/datastore/query';
    this.currentDatasetId = 'f38d0706-1239-442c-a3cc-40ef1b686ac0'; // 2025 dataset
    
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_nadac_drugs',
            description: 'Search for drug pricing information in the NADAC database',
            inputSchema: {
              type: 'object',
              properties: {
                drug_name: {
                  type: 'string',
                  description: 'Name of the drug to search for (partial matches supported)',
                },
                ndc: {
                  type: 'string',
                  description: 'National Drug Code (NDC) for exact drug identification',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                format: {
                  type: 'string',
                  enum: ['json', 'csv'],
                  description: 'Response format (default: json)',
                  default: 'json',
                },
              },
            },
          },
          {
            name: 'get_nadac_by_date_range',
            description: 'Get NADAC data within a specific date range',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date in YYYY-MM-DD format',
                },
                end_date: {
                  type: 'string',
                  description: 'End date in YYYY-MM-DD format',
                },
                drug_name: {
                  type: 'string',
                  description: 'Optional: Filter by drug name',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 20)',
                  default: 20,
                },
              },
              required: ['start_date', 'end_date'],
            },
          },
          {
            name: 'get_nadac_price_changes',
            description: 'Get recent NADAC price changes and trends',
            inputSchema: {
              type: 'object',
              properties: {
                days_back: {
                  type: 'number',
                  description: 'Number of days to look back for changes (default: 30)',
                  default: 30,
                },
                min_change_percent: {
                  type: 'number',
                  description: 'Minimum percentage change to include (default: 5)',
                  default: 5,
                },
                drug_category: {
                  type: 'string',
                  description: 'Filter by drug category (B=Brand, G=Generic)',
                  enum: ['B', 'G'],
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results (default: 15)',
                  default: 15,
                },
              },
            },
          },
          {
            name: 'get_nadac_statistics',
            description: 'Get statistical overview of NADAC data',
            inputSchema: {
              type: 'object',
              properties: {
                metric: {
                  type: 'string',
                  enum: ['price_distribution', 'drug_counts', 'recent_updates'],
                  description: 'Type of statistics to retrieve',
                },
                category: {
                  type: 'string',
                  enum: ['B', 'G', 'all'],
                  description: 'Drug category filter (B=Brand, G=Generic, all=Both)',
                  default: 'all',
                },
              },
              required: ['metric'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_nadac_drugs':
            return await this.searchNADACDrugs(args);
          case 'get_nadac_by_date_range':
            return await this.getNADACByDateRange(args);
          case 'get_nadac_price_changes':
            return await this.getNADACPriceChanges(args);
          case 'get_nadac_statistics':
            return await this.getNADACStatistics(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async makeNADACRequest(conditions = [], limit = 100, format = 'json') {
    try {
      const params = new URLSearchParams();
      
      // Add conditions
      conditions.forEach((condition, index) => {
        params.append(`conditions[${index}][property]`, condition.property);
        params.append(`conditions[${index}][value]`, condition.value);
        params.append(`conditions[${index}][operator]`, condition.operator);
      });
      
      params.append('format', format);
      if (limit) {
        params.append('limit', limit.toString());
      }

      const url = `${this.baseURL}/${this.currentDatasetId}/0/download?${params.toString()}`;
      
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'NADAC-MCP-Server/1.0.0',
        },
      });

      return response.data;
    } catch (error) {
      console.error('NADAC API Error:', error.message);
      throw new Error(`Failed to fetch NADAC data: ${error.message}`);
    }
  }

  async searchNADACDrugs(args) {
    const { drug_name, ndc, limit = 10, format = 'json' } = args;
    
    const conditions = [];
    
    if (drug_name) {
      conditions.push({
        property: 'ndc_description',
        value: drug_name,
        operator: 'contains',
      });
    }
    
    if (ndc) {
      conditions.push({
        property: 'ndc',
        value: ndc,
        operator: '=',
      });
    }

    // Filter for current year data
    conditions.push({
      property: 'as_of_date',
      value: '2025-01-01',
      operator: '>=',
    });

    const data = await this.makeNADACRequest(conditions, limit, format);
    
    return {
      content: [
        {
          type: 'text',
          text: `Found NADAC drug pricing data:\n\n${format === 'json' ? JSON.stringify(data, null, 2) : data}`,
        },
      ],
    };
  }

  async getNADACByDateRange(args) {
    const { start_date, end_date, drug_name, limit = 20 } = args;
    
    const conditions = [
      { property: 'effective_date', value: start_date, operator: '>=' },
      { property: 'effective_date', value: end_date, operator: '<=' },
    ];
    
    if (drug_name) {
      conditions.push({ property: 'ndc_description', value: drug_name, operator: 'contains' });
    }

    const data = await this.makeNADACRequest(conditions, limit);
    
    return {
      content: [
        {
          type: 'text',
          text: `NADAC data from ${start_date} to ${end_date}:\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  async getNADACPriceChanges(args) {
    const { days_back = 30, min_change_percent = 5, drug_category, limit = 15 } = args;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_back);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    const conditions = [
      { property: 'effective_date', value: cutoffDateStr, operator: '>=' },
    ];
    
    if (drug_category) {
      conditions.push({ property: 'classification_for_rate_setting', value: drug_category, operator: '=' });
    }

    const data = await this.makeNADACRequest(conditions, limit);
    
    return {
      content: [
        {
          type: 'text',
          text: `Recent NADAC price changes (last ${days_back} days):\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  }

  async getNADACStatistics(args) {
    const { metric, category = 'all' } = args;
    
    const conditions = [];
    
    if (category !== 'all') {
      conditions.push({ property: 'classification_for_rate_setting', value: category, operator: '=' });
    }

    // Get current data
    conditions.push({ property: 'as_of_date', value: '2025-01-01', operator: '>=' });

    const data = await this.makeNADACRequest(conditions, 1000);
    
    // Process statistics based on metric type
    let stats = {};
    
    if (Array.isArray(data)) {
      switch (metric) {
        case 'price_distribution':
          const prices = data.map(item => parseFloat(item.nadac_per_unit)).filter(p => !isNaN(p));
          stats = {
            count: prices.length,
            average: prices.reduce((a, b) => a + b, 0) / prices.length,
            min: Math.min(...prices),
            max: Math.max(...prices),
            median: prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)],
          };
          break;
        case 'drug_counts':
          stats = {
            total_drugs: data.length,
            brand_drugs: data.filter(item => item.classification_for_rate_setting === 'B').length,
            generic_drugs: data.filter(item => item.classification_for_rate_setting === 'G').length,
          };
          break;
        case 'recent_updates':
          const recent = data.filter(item => {
            const effectiveDate = new Date(item.effective_date);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return effectiveDate >= thirtyDaysAgo;
          });
          stats = {
            total_recent_updates: recent.length,
            percentage_of_total: ((recent.length / data.length) * 100).toFixed(2),
          };
          break;
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `NADAC Statistics (${metric}):\n\n${JSON.stringify(stats, null, 2)}`,
        },
      ],
    };
  }

  async runHTTP(port = process.env.PORT || 8080) {
  const app = express();
  
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
    credentials: true
  }));
  
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      server: 'nadac-mcp-server',
      version: '1.0.4',
      timestamp: new Date().toISOString()
    });
  });

  const handleMCP = async (req, res) => {
    console.log('MCP Request received:', JSON.stringify(req.body, null, 2));
    
    try {
      const transport = new StreamableHTTPServerTransport();
      await this.server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: error.message,
          jsonrpc: '2.0',
          id: req.body?.id || null
        });
      }
    }
  };

  app.post('/mcp', handleMCP);
  app.get('/mcp', handleMCP);

  app.listen(port, '0.0.0.0', () => {
    console.log(`NADAC MCP server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`Protocol version: 2025-03-26 (Streamable HTTP)`);
    console.log('Server info:', {
      name: 'nadac-mcp-server',
      version: '1.0.4',
      description: 'MCP server providing access to NADAC pharmaceutical pricing data'
    });
  });
}

// Check if running in HTTP mode (for cloud deployment)
if (process.env.HTTP_MODE === 'true') {
  const server = new NADACServer();
  server.runHTTP();
} else {
  // Default stdio mode for MCP
  const server = new NADACServer();
  server.run().catch(console.error);
}
