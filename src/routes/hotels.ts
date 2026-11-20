import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { config } from '../config';
import { getTemporalClient } from '../temporal/connection';
import { hotelOfferWorkflow } from '../temporal/workflows';
import { ALL_SUPPLIERS_DOWN, HotelSearchInput } from '../types';
import { errMsg, logger } from '../utils/logger';

export const hotelsRouter = Router();

class BadRequest extends Error {}

function parsePrice(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (typeof raw !== 'string' || !Number.isFinite(n) || n < 0) {
    throw new BadRequest(`${field} must be a non-negative number`);
  }
  return n;
}

function parseQuery(req: Request): HotelSearchInput {
  const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
  if (!city) throw new BadRequest('city query parameter is required');

  const minPrice = parsePrice(req.query.minPrice, 'minPrice');
  const maxPrice = parsePrice(req.query.maxPrice, 'maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new BadRequest('minPrice cannot be greater than maxPrice');
  }
  return { city, minPrice, maxPrice };
}

// GET /api/hotels?city=delhi[&minPrice=..][&maxPrice=..]
hotelsRouter.get('/hotels', async (req: Request, res: Response) => {
  let input: HotelSearchInput;
  try {
    input = parseQuery(req);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }

  const workflowId = `hotel-offers-${input.city}-${randomUUID()}`;
  try {
    const client = await getTemporalClient();
    const result = await client.workflow.execute(hotelOfferWorkflow, {
      taskQueue: config.taskQueue,
      workflowId,
      args: [input],
      workflowExecutionTimeout: config.workflowTimeoutMs,
    });

    if (result.warnings.length) {
      res.setHeader('X-Supplier-Warnings', encodeURIComponent(result.warnings.join(' | ')));
    }
    res.setHeader('X-Workflow-Id', workflowId);
    return res.json(result.hotels);
  } catch (e) {
    if (
      e instanceof WorkflowFailedError &&
      e.cause instanceof ApplicationFailure &&
      e.cause.type === ALL_SUPPLIERS_DOWN
    ) {
      logger.error('all suppliers down', { workflowId, city: input.city });
      return res.status(502).json({ error: 'Both suppliers are unavailable', warnings: (e.cause.details?.[0] as string[] | undefined) ?? [] });
    }
    logger.error('hotel search failed', { workflowId, error: errMsg(e) });
    return res.status(500).json({ error: 'Failed to process hotel search', workflowId });
  }
});
