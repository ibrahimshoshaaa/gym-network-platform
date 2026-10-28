import {registerWhatsappRoutes} from './auth/whatsapp.js';
import {registerDeletionRoutes} from './accounts/deletion-routes.js';
import { registerServiceRoutes } from './services/routes.js';
import { registerReservationRoutes } from './bookings/reservations.js';
import { registerBookingPolicyRoutes } from './bookings/routes.js';
import {registerPromotionRoutes} from "./promotions/routes.js";
import {registerMaintenanceRoutes} from "./maintenance/routes.js";
import {registerMarketRoutes} from "./market/routes.js";
import {registerCampaignRoutes} from "./campaigns/routes.js";
import { registerApplicationRoutes } from "./applications/routes.js";
import { registerPointRoutes } from "./points/routes.js";
import { registerDisputeRoutes } from './disputes/routes.js';
import { registerMediaRoutes } from './media/routes.js';
import { registerEngagementRoutes } from './engagement/routes.js';
import Fastify from 'fastify';
import { registerWalletRoutes } from './wallet/routes.js';
import { registerDirectoryRoutes } from './directory/routes.js';
import { registerReportRoutes } from './reports/routes.js';
import { registerWithdrawalRoutes } from './withdrawals/routes.js';
import { registerReviewRoutes } from './reviews/routes.js';
import type { PrismaClient } from '@prisma/client';
import { authenticate, hashToken } from './auth/sessions.js';
import { DomainError } from './domain/errors.js';
import { ThrottleError } from './auth/throttle.js';
import { registerTraineeRoutes } from './auth/routes.js';
import { publicIdentity } from './auth/trainees.js';
import { registerTopupRoutes } from './topups/routes.js';
import { CloudinaryReceiptStorage, type ReceiptStorage } from './topups/receipts.js';
import { registerOperationRoutes } from './operations/routes.js';
import { registerGymRoutes } from './gyms/routes.js';

export function buildApp(db?: PrismaClient, options: { receiptStorage?: ReceiptStorage } = {}) {
  const app = Fastify({ bodyLimit: 8192, logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.token', 'req.body.requestKey', 'req.body.whatsappToken'] }, trustProxy: false });
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.authorization || ['/auth/', '/admin/', '/gyms', '/invitations/', '/me', '/topup', '/receipts', '/trainee/', '/operations', '/operation-reviews', '/withdrawals', '/reports', '/directory'].some(prefix => request.url.startsWith(prefix))) reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      const codes: Record<string, number> = { RECOVERY_INVALID: 400, IMAGE_LIMIT: 409, MARKET_LISTING_LIMIT: 409, MAINTENANCE_REAPPROVAL_REQUIRED: 409, WALLET_BUSY: 503, DIRECTORY_BUSY: 503, REPORT_BUSY: 503, EXPORT_TOO_LARGE: 413, CALENDAR_NOT_CONFIGURED: 409, CALENDAR_CUTOFF_INVALID: 409, DELAY_REASON_REQUIRED: 409, CANCEL_WINDOW_CLOSED: 409, VISIT_ALREADY_CANCELLED: 409, OPERATION_REVIEW_EXISTS: 409, SETTLEMENT_REVIEW_REQUIRED: 409, INSUFFICIENT_FUNDS: 409, QR_INVALID: 409, QR_ALREADY_USED: 409, TRAINEE_UNAVAILABLE: 404, INSUFFICIENT_POINTS: 409, STORAGE_NOT_CONFIGURED: 503, STORAGE_UNAVAILABLE: 503, INVALID_RECEIPT: 400, RECEIPT_ACCESS_DENIED: 403, RECEIPT_ALREADY_USED: 409, STALE_SETTINGS: 409, PRICING_NOT_CONFIGURED: 409, PACKAGE_UNAVAILABLE: 409, PAYMENT_METHOD_UNAVAILABLE: 409, IDEMPOTENCY_CONFLICT: 409, PAYMENT_AMOUNT_MISMATCH: 409, PAYMENT_REFERENCE_USED: 409, LEGACY_REQUEST_REVIEW_REQUIRED: 409, WALLET_EXPIRY_REVIEW_REQUIRED: 409, ACCOUNT_NOT_FOUND: 409, INVALID_INPUT: 400, INVALID_CREDENTIALS: 401, UNAUTHENTICATED: 401, ACCOUNT_UNAVAILABLE: 409, RATE_LIMITED: 429, AUTH_BUSY: 503,
        ACCESS_DENIED: 403, GYM_ACCESS_DENIED: 403, BRANCH_ACCESS_DENIED: 403, GYM_INACTIVE: 409, INVALID_STATE: 409,
        BOOKING_HOURS_NOT_CONFIGURED: 409, OUTSIDE_OPENING_HOURS: 409, SESSION_ENDS_AFTER_CLOSING: 409, SERVICE_SELECTION_REQUIRED: 409, BOOKING_SERVICE_UNAVAILABLE: 409, BRANCH_QR_REQUIRED: 409, QR_WRONG_BRANCH: 409, BRANCH_LOCATION_REQUIRED: 409, LOCATION_STALE: 409, LOCATION_INACCURATE: 409, GO_TO_BRANCH: 409, BRANCH_NOT_READY: 409, NOT_FOUND: 404, PENDING_REQUEST_EXISTS: 409, STALE_PRICE_REQUEST: 409, STAFF_ALREADY_ASSIGNED: 409, INVITATION_INVALID: 400 };
      const phoneCodes:Record<string,number>={WHATSAPP_UNAVAILABLE:503,PHONE_OTP_DISABLED:503,PHONE_OTP_SEND_FAILED:503,PHONE_OTP_TEST_NUMBER:400,PHONE_OTP_WAIT:429,PHONE_OTP_INVALID:400,PHONE_ACCOUNT_NOT_FOUND:409,PHONE_VERIFICATION_REQUIRED:409};
      const status = phoneCodes[error.code] ?? codes[error.code] ?? 500;
      if (error instanceof ThrottleError) reply.header('Retry-After', error.retryAfter);
      if (error.code === 'AUTH_BUSY') reply.header('Retry-After', 1);
      return reply.code(status).send({ code: status < 500 || status === 503 ? error.code : 'INTERNAL_ERROR', requestId: request.id });
    }
    // Never log request bodies or Prisma argument dumps containing credentials.
    request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(status).send({ code: status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', requestId: request.id });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'gym-network-api',
    version: '0.1.0',
  }));

  registerWhatsappRoutes(app,db);

  if (db) {
    registerServiceRoutes(app, db);
    registerBookingPolicyRoutes(app, db);
    registerReservationRoutes(app, db);
    registerCampaignRoutes(app,db);
    registerMarketRoutes(app,db);
    registerMaintenanceRoutes(app,db);
    registerPromotionRoutes(app,db);
    registerApplicationRoutes(app,db);
    registerPointRoutes(app,db);
    registerMediaRoutes(app, db);
    registerDisputeRoutes(app, db);
    registerEngagementRoutes(app, db);
    registerDeletionRoutes(app, db);
    registerTraineeRoutes(app, db);
    registerGymRoutes(app, db);
    registerOperationRoutes(app, db);
    registerReviewRoutes(app, db);
    registerWithdrawalRoutes(app, db);
    registerReportRoutes(app, db);
    registerDirectoryRoutes(app, db);
    registerWalletRoutes(app, db);
    registerTopupRoutes(app, db, options.receiptStorage ?? new CloudinaryReceiptStorage());
    app.get('/me', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      return publicIdentity(user);
    });
    app.post('/auth/logout', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      const token = request.headers.authorization!.slice(7);
      await db.authSession.updateMany({ where: { tokenHash: hashToken(token), userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return reply.code(204).send();
    });
  }
  // Contact verification/OTP remains deferred.
  return app;
}


