#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import * as icd10 from './tools/icd10.js';
import * as npi from './tools/npi.js';
import * as ndc from './tools/ndc.js';
import * as dea from './tools/dea.js';
import { authMiddleware, createKey, revokeKey, PLANS } from './keys.js';
import { createCheckoutSession, handleWebhook } from './stripe.js';

const server = new McpServer({
  name: 'mcp-healthcare',
  version: '1.0.0',
});

// --- ICD-10 Tools ---

server.tool(
  'icd10_lookup',
  'Look up an ICD-10-CM diagnosis code. Returns the code description, formatted code, and chapter information. Example: "E11.9" returns "Type 2 diabetes mellitus without complications".',
  { code: z.string().describe('ICD-10-CM code to look up (e.g., "E11.9", "J06.9", "M54.5")') },
  async ({ code }) => ({
    content: [{ type: 'text', text: JSON.stringify(icd10.lookup(code), null, 2) }],
  }),
);

server.tool(
  'icd10_search',
  `Search ${icd10.totalCodes.toLocaleString()} ICD-10-CM codes by keyword. Returns matching codes sorted by relevance. Useful for finding diagnosis codes when you know the condition name but not the code.`,
  {
    query: z.string().describe('Search term (e.g., "diabetes", "chest pain", "hypertension")'),
    limit: z.number().optional().describe('Max results to return (default 25, max 100)'),
  },
  async ({ query, limit }) => ({
    content: [{ type: 'text', text: JSON.stringify(icd10.search(query, limit), null, 2) }],
  }),
);

server.tool(
  'icd10_validate',
  'Validate whether an ICD-10-CM code exists in the 2025 code set. Returns validity status, description if found, and chapter info.',
  { code: z.string().describe('ICD-10-CM code to validate (e.g., "E11.9")') },
  async ({ code }) => ({
    content: [{ type: 'text', text: JSON.stringify(icd10.validate(code), null, 2) }],
  }),
);

// --- NPI Tools ---

server.tool(
  'npi_search',
  'Search the NPPES NPI Registry for healthcare providers by name, specialty, or location. Queries the live CMS registry in real-time.',
  {
    first_name: z.string().optional().describe('Provider first name'),
    last_name: z.string().optional().describe('Provider last name'),
    organization_name: z.string().optional().describe('Organization name'),
    taxonomy_description: z.string().optional().describe('Specialty (e.g., "Cardiology", "Family Medicine")'),
    city: z.string().optional().describe('City'),
    state: z.string().optional().describe('2-letter state code (e.g., "CA", "NY")'),
    postal_code: z.string().optional().describe('ZIP code'),
    limit: z.number().optional().describe('Max results (default 10, max 200)'),
  },
  async (params) => ({
    content: [{ type: 'text', text: JSON.stringify(await npi.search(params), null, 2) }],
  }),
);

server.tool(
  'npi_lookup',
  'Look up a specific healthcare provider by their 10-digit NPI number. Returns full provider details including name, addresses, taxonomies, and identifiers from the live NPPES registry.',
  { number: z.string().describe('10-digit NPI number (e.g., "1234567890")') },
  async ({ number }) => ({
    content: [{ type: 'text', text: JSON.stringify(await npi.lookup(number), null, 2) }],
  }),
);

// --- NDC Tools ---

server.tool(
  'ndc_lookup',
  `Look up a drug product by its National Drug Code (NDC). Searches ${ndc.totalProducts.toLocaleString()} products from the FDA NDC directory. Returns drug name, ingredients, manufacturer, dosage form, and more.`,
  { ndc: z.string().describe('NDC code with or without dashes (e.g., "0002-1433-80" or "00021433")') },
  async ({ ndc: code }) => ({
    content: [{ type: 'text', text: JSON.stringify(ndc.lookup(code), null, 2) }],
  }),
);

server.tool(
  'ndc_search',
  `Search ${ndc.totalProducts.toLocaleString()} FDA drug products by name, generic name, or manufacturer. Returns matching products sorted by relevance.`,
  {
    query: z.string().describe('Drug name or search term (e.g., "metformin", "lisinopril", "advil")'),
    limit: z.number().optional().describe('Max results (default 25, max 100)'),
  },
  async ({ query, limit }) => ({
    content: [{ type: 'text', text: JSON.stringify(ndc.search(query, limit), null, 2) }],
  }),
);

server.tool(
  'ndc_search_ingredient',
  'Search FDA drug products by active ingredient name. Useful for finding all formulations containing a specific drug compound.',
  {
    ingredient: z.string().describe('Active ingredient name (e.g., "acetaminophen", "ibuprofen", "metformin")'),
    limit: z.number().optional().describe('Max results (default 25, max 100)'),
  },
  async ({ ingredient, limit }) => ({
    content: [{ type: 'text', text: JSON.stringify(ndc.searchIngredient(ingredient, limit), null, 2) }],
  }),
);

// --- DEA Tools ---

server.tool(
  'dea_validate',
  'Validate a DEA (Drug Enforcement Administration) registration number using the official Luhn-variant checksum algorithm. Identifies registrant type and detects formatting errors.',
  { dea: z.string().describe('9-character DEA number to validate (e.g., "AB1234563")') },
  async ({ dea: number }) => ({
    content: [{ type: 'text', text: JSON.stringify(dea.validate(number), null, 2) }],
  }),
);

server.tool(
  'dea_generate_test',
  'Generate a valid test DEA number for development and testing. The generated number passes checksum validation but is NOT a real DEA registration.',
  { lastName: z.string().describe('Last name (first letter used as second character of the DEA number)') },
  async ({ lastName }) => ({
    content: [{ type: 'text', text: JSON.stringify(dea.generateTest(lastName), null, 2) }],
  }),
);

// --- Start ---

const TOOL_COUNT = 10;

const main = async () => {
  const port = process.env.PORT;

  if (port) {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    app.get('/', (_req, res) => {
      res.json({
        name: 'mcp-healthcare',
        version: '1.0.0',
        tools: TOOL_COUNT,
        transport: 'streamable-http',
        plans: PLANS,
      });
    });

    // --- Stripe checkout ---
    app.post('/checkout', async (req, res) => {
      try {
        const { plan, success_url, cancel_url } = req.body;
        const session = await createCheckoutSession(plan, success_url, cancel_url);
        res.json(session);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // --- Stripe webhook (raw body needed for signature verification) ---
    app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
      try {
        const result = handleWebhook(req.body, req.headers['stripe-signature']);
        res.json({ received: true, result });
      } catch (err) {
        console.error('[webhook] Error:', err.message);
        res.status(400).json({ error: err.message });
      }
    });

    // --- Admin key management ---
    const adminAuth = (req, res, next) => {
      const secret = process.env.ADMIN_SECRET;
      if (!secret || req.headers['x-admin-secret'] !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    };

    app.post('/admin/keys', adminAuth, (req, res) => {
      const { plan, email } = req.body;
      const result = createKey(plan, email);
      res.json(result);
    });

    app.delete('/admin/keys/:key', adminAuth, (req, res) => {
      const revoked = revokeKey(req.params.key);
      res.json({ revoked });
    });

    const transports = {};

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      let transport = transports[sessionId];

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        await server.connect(transport);
        transports[transport.sessionId] = transport;
      }

      await transport.handleRequest(req, res, req.body);
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      const transport = transports[sessionId];
      if (!transport) {
        res.status(400).json({ error: 'No active session. Send a POST to /mcp first.' });
        return;
      }
      await transport.handleRequest(req, res);
    });

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      const transport = transports[sessionId];
      if (!transport) {
        res.status(400).json({ error: 'No active session.' });
        return;
      }
      await transport.handleRequest(req, res);
    });

    app.listen(parseInt(port, 10), () => {
      console.log(`MCP healthcare server running on HTTP port ${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
};

main().catch((err) => {
  console.error('Failed to start MCP healthcare server:', err);
  process.exit(1);
});
