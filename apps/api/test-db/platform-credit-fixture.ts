import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {dispatchPoints,pointQuote} from '../src/points/service.js';
export async function creditFromPlatform(db:PrismaClient,adminId:string,traineeId:string,points:number){
 const q=await db.$transaction(tx=>pointQuote(tx,adminId,{recipientId:traineeId,points}));
 return dispatchPoints(db,adminId,randomUUID(),{recipientId:traineeId,recipientLabel:q.recipientLabel,points,pricingVersion:q.pricingVersion,receivedAmountPiasters:q.chargePiasters,fundsReceived:true,recipientConfirmed:true,paymentMethod:'CASH'});
}
