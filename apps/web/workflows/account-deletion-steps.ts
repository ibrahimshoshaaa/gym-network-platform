export async function eraseAccountMediaStep(id:string){
 'use step';
 const {eraseAccountMedia}=await import('@gym/api');
 console.info('Account media erasure batch',{deletionId:id});
 return eraseAccountMedia(id);
}
eraseAccountMediaStep.maxRetries=20;
