import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { createBooking, cancelBooking, decideBooking, issueBookingQr, scanBooking, listBookings } from './service.js';

export function registerReservationRoutes(app:FastifyInstance,db:PrismaClient){
 const id=(params:unknown)=>parse(z.object({id:z.string().uuid()}).strict(),params).id;
 app.post('/trainee/bookings',async r=>{
  const actor=await actorId(db,r);await consumeAuthLimit(db,'booking-create',actor,30,900);
  return createBooking(db,actor,parse(z.string().uuid(),r.headers['idempotency-key']),r.body);
 });
 app.get('/trainee/bookings',async r=>listBookings(db,await actorId(db,r),false));
 app.post('/trainee/bookings/:id/cancel',async r=>cancelBooking(db,await actorId(db,r),id(r.params),r.body));
 app.post('/trainee/bookings/:id/qr',async r=>{
  const actor=await actorId(db,r);await consumeAuthLimit(db,'booking-qr',actor,60,60);
  return issueBookingQr(db,actor,id(r.params),r.headers.authorization!.slice(7));
 });
 app.get('/admin/bookings/review',async r=>listBookings(db,await actorId(db,r),true));
 app.post('/admin/bookings/process-due',async r=>listBookings(db,await actorId(db,r),true));
 app.post('/admin/bookings/:id/decision',async r=>decideBooking(db,await actorId(db,r),id(r.params),r.body));
 app.post('/operations/branches/:id/bookings/scan',async r=>{
  const actor=await actorId(db,r);await consumeAuthLimit(db,'booking-scan',actor,120,60);
  return scanBooking(db,actor,id(r.params),r.body);
 });
}
