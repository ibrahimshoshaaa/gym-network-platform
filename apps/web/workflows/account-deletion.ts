import { eraseAccountMediaStep } from './account-deletion-steps';
export async function accountMediaErasure(id:string){
 'use workflow';
 console.info('Account media erasure started',{deletionId:id});
 while(await eraseAccountMediaStep(id)) { /* bounded, idempotent outbox batches */ }
 console.info('Account media erasure completed',{deletionId:id});
}
