import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type UserRole } from '@prisma/client';
import { createService, requestServiceChange, setServiceActive, reviewService, listServices } from '../src/services/service.js';
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/(gym_ci|gym_test)$/.test(url.pathname)) throw Error('Disposable local test database required');
const db = new PrismaClient();
after(() => db.$disconnect());
const user = (role: UserRole) => db.user.create({ data: { role, displayName: 'Service test', phoneE164: '+svc' + randomUUID() } });
async function fixture() {
  const owner = await user('GYM_OWNER'), admin = await user('PLATFORM_ADMIN'), trainee = await user('TRAINEE'), cashier = await user('CASHIER');
  const gym = await db.gym.create({ data: { ownerId: owner.id, name: 'Service test gym', status: 'ACTIVE', ownerAcceptedAt: new Date() } });
  const branch = await db.branch.create({ data: { gymId: gym.id, name: 'Service test branch', status: 'ACTIVE', visitPricePoints: 20, sessionMinutes: 120 } });
  await db.staffAssignment.create({ data: { userId: cashier.id, branchId: branch.id, role: 'CASHIER' } });
  return { owner, admin, trainee, cashier, gym, branch };
}
const input = { name: 'كارديو', description: 'خدمة اختبار', points: 15, durationMinutes: 30, reason: 'إضافة خدمة جديدة' };
test('service publication needs admin approval, preserves approved price during edits and never posts money', async () => {
  const f = await fixture(), before = [await db.pointTransaction.count(), await db.moneyTransaction.count()];
  const first = await createService(db, f.owner.id, f.branch.id, input);
  assert.equal(first.service.active, false); assert.equal(first.service.points, null);
  assert.equal((await listServices(db, f.trainee.id, f.branch.id, false)).items.length, 0);
  await assert.rejects(setServiceActive(db, f.owner.id, f.branch.id, first.service.id, { active: true, expectedVersion: 0 }));
  await assert.rejects(reviewService(db, f.owner.id, first.request.id, { decision: 'APPROVED', reason: 'مراجعة بدون صلاحية', expectedVersion: 0 }));
  const review = { decision: 'APPROVED', reason: 'تم اعتماد السعر والمدة', expectedVersion: 0 };
  const approved = await reviewService(db, f.admin.id, first.request.id, review);
  assert.equal(approved.service.version, 1); assert.equal(approved.service.active, true);
  assert.equal((await reviewService(db, f.admin.id, first.request.id, review)).alreadyApplied, true);
  assert.equal((await listServices(db, f.trainee.id, f.branch.id, false)).minimumPoints, 15);
  const change = await requestServiceChange(db, f.owner.id, f.branch.id, first.service.id, { ...input, points: 30, expectedVersion: 1 });
  assert.equal((await listServices(db, f.trainee.id, f.branch.id, false)).minimumPoints, 15);
  await reviewService(db, f.admin.id, change.id, { decision: 'REJECTED', reason: 'السعر غير مناسب حاليًا', expectedVersion: 1 });
  assert.equal((await listServices(db, f.trainee.id, f.branch.id, false)).minimumPoints, 15);
  await setServiceActive(db, f.owner.id, f.branch.id, first.service.id, { active: false, expectedVersion: 1 });
  assert.equal((await listServices(db, f.trainee.id, f.branch.id, false)).minimumPoints, null);
  await assert.rejects(requestServiceChange(db, f.owner.id, f.branch.id, first.service.id, { ...input, expectedVersion: 1 }));
  assert.deepEqual([await db.pointTransaction.count(), await db.moneyTransaction.count()], before);
});
test('cashier and unrelated owner cannot manage services, suspended gyms are not public', async () => {
  const f = await fixture(), stranger = await user('GYM_OWNER');
  for (const actor of [f.cashier, f.trainee, stranger]) {
    await assert.rejects(createService(db, actor.id, f.branch.id, input));
    await assert.rejects(listServices(db, actor.id, f.branch.id, true));
  }
  await db.gym.update({ where: { id: f.gym.id }, data: { status: 'SUSPENDED' } });
  await assert.rejects(createService(db, f.owner.id, f.branch.id, input));
  await assert.rejects(listServices(db, f.trainee.id, f.branch.id, false));
});
test('concurrent proposals and conflicting admin reviews cannot overwrite each other', async () => {
  const f = await fixture();
  const first = await createService(db, f.owner.id, f.branch.id, input);
  await reviewService(db, f.admin.id, first.request.id, { decision: 'APPROVED', reason: 'الاعتماد الأول للخدمة', expectedVersion: 0 });
  const attempts = await Promise.allSettled([20, 25].map(points => requestServiceChange(db, f.owner.id, f.branch.id, first.service.id, { ...input, points, expectedVersion: 1 })));
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
  const request = await db.servicePriceRequest.findFirstOrThrow({ where: { serviceId: first.service.id, status: 'PENDING' } });
  const reviews = await Promise.allSettled(['APPROVED', 'REJECTED'].map(decision => reviewService(db, f.admin.id, request.id, { decision, reason: 'مراجعة متزامنة للاختبار', expectedVersion: 1 })));
  assert.equal(reviews.filter(a => a.status === 'fulfilled').length, 1);
  assert.equal(await db.servicePriceRequest.count({ where: { serviceId: first.service.id, status: 'PENDING' } }), 0);
});

test('catalog services keep stable IDs, approved hours and bilingual names', async()=>{
 const f=await fixture();
 const created=await createService(db,f.owner.id,f.branch.id,{...input,presetId:'cardio',name:'untrusted override',openMinute:540,closeMinute:1080});
 assert.equal(created.service.name,'أجهزة كارديو');
 assert.equal(created.request.openMinute,540);
 await assert.rejects(createService(db,f.owner.id,f.branch.id,{...input,presetId:'wifi'}));
 await assert.rejects(createService(db,f.owner.id,f.branch.id,{...input,presetId:'cardio'}));
 await reviewService(db,f.admin.id,created.request.id,{decision:'APPROVED',reason:'Approve preset service',expectedVersion:0});
 const listed=(await listServices(db,f.trainee.id,f.branch.id,false)).items[0]!;
 assert.equal(listed.presetId,'cardio');assert.equal(listed.openMinute,540);assert.equal(listed.preset?.nameEn,'Cardio');
 await assert.rejects(requestServiceChange(db,f.owner.id,f.branch.id,created.service.id,{...input,presetId:'sauna',expectedVersion:1}));
});


test('only admin can manage stable bilingual catalog choices and disable without deleting', async()=>{
 const {savePreset,listPresets}=await import('../src/services/catalog.js');
 const f=await fixture(),id='test_'+randomUUID().replaceAll('-','');
 const data={id,nameAr:'خدمة اختبار',nameEn:'Test service',category:'training',kind:'SERVICE',active:true};
 await assert.rejects(savePreset(db,f.owner.id,data));
 const created=await savePreset(db,f.admin.id,data);assert.equal(created.version,0);
 await assert.rejects(savePreset(db,f.admin.id,{...data,kind:'FACILITY',expectedVersion:0}));
 await savePreset(db,f.admin.id,{...data,active:false,expectedVersion:0});
 assert.equal((await listPresets(db,f.owner.id)).items.some(p=>p.id===id),false);
 assert.equal((await listPresets(db,f.admin.id,true)).items.some(p=>p.id===id),true);
 assert.equal(await db.auditLog.count({where:{actorId:f.admin.id,action:'SERVICE_PRESET_SAVED',reason:{contains:id}}}),2);
});
