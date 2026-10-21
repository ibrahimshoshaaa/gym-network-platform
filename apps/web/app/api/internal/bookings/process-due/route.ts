import { verifyBookingScheduler } from '../../../../../lib/booking-scheduler-auth';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!await verifyBookingScheduler(request.headers.get('authorization'))) {
    return Response.json({code:'UNAUTHENTICATED'}, {status:401, headers:{'Cache-Control':'no-store'}});
  }
  try {
    const { runScheduledBookingExpiry } = await import('@gym/api');
    const result = await runScheduledBookingExpiry();
    return Response.json(result, {status:result.failed ? 503 : 200, headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({code:'SERVICE_UNAVAILABLE'}, {status:503, headers:{'Cache-Control':'no-store'}});
  }
}
