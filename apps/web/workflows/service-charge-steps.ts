export async function acceptPromotion(actor:string,id:string,input:unknown){
 'use step';
 const {acceptDurablePromotion}=await import('@gym/api');
 console.info('Accept promotion and register charge',{promotionId:id});
 return acceptDurablePromotion(actor,id,input);
}
export async function collectPromotion(id:string){
 'use step';
 const {settleDurablePromotion}=await import('@gym/api');
 console.info('Collect due promotion charge',{promotionId:id});
 return settleDurablePromotion(id);
}
collectPromotion.maxRetries=20;
