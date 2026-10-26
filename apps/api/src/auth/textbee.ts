import {createHmac,randomInt} from 'node:crypto';
import {DomainError} from '../domain/errors.js';

export function textbeeConfig(env:NodeJS.ProcessEnv=process.env){
 const apiKey=env.TEXTBEE_API_KEY?.trim(),deviceId=env.TEXTBEE_DEVICE_ID?.trim(),secret=env.GYMBANK_OTP_SECRET;
 const sim=env.TEXTBEE_SIM_SUBSCRIPTION_ID;
 if(!apiKey||/[\r\n]/.test(apiKey)||!deviceId||!/^[a-f0-9]{24}$/i.test(deviceId)||!secret||secret.length<32||
  (sim!==undefined&&(!/^\d+$/.test(sim)||!Number.isSafeInteger(Number(sim)))))return null;
 return {apiKey,deviceId,secret,...(sim===undefined?{}:{simSubscriptionId:Number(sim)})};
}
export const newPhoneCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
export function phoneCodeMessage(code:string,language:'ar'|'en'='ar'){
 if(!/^\d{6}$/.test(code))throw new DomainError('INVALID_INPUT');
 if(language==='en'){const words=['zero','one','two','three','four','five','six','seven','eight','nine'];return `GymBank code: ${[...code].map(d=>words[Number(d)]).join(' ')}. Do not share.`;}
 const words=['صفر','واحد','اتنين','تلاتة','أربعة','خمسة','ستة','سبعة','تمانية','تسعة'];
 return `رمز جيم بانك: ${[...code].map(d=>words[Number(d)]).join(' ')}. لا تشاركه.`;
}
export function smsCodeHash(id:string,phone:string,purpose:string,code:string){
 const config=textbeeConfig();if(!config)throw new DomainError('PHONE_OTP_DISABLED');
 return createHmac('sha256',config.secret).update(`${id}:${phone}:${purpose}:${code}`).digest('hex');
}
// Server-only. No automatic retry: a timeout may follow a successfully queued SMS.
export async function sendTextbeeCode(phone:string,code:string,_purpose:'REGISTER'|'RESET',transport:typeof fetch=fetch,language:'ar'|'en'='ar'){
 const config=textbeeConfig();if(!config)throw new DomainError('PHONE_OTP_DISABLED');
 const message=phoneCodeMessage(code,language);
 try{
  const response=await transport('https://api.textbee.dev/api/v1/gateway/send-sms',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{'content-type':'application/json','x-api-key':config.apiKey},
   body:JSON.stringify({deviceId:config.deviceId,recipients:[phone],
    message,
    ...(config.simSubscriptionId===undefined?{}:{simSubscriptionId:config.simSubscriptionId})}),
  });
  if(!response.ok)throw new Error('provider rejected');
  const body=await response.json() as {data?:{success?:boolean;smsBatchId?:string;successCount?:number;failureCount?:number;warning?:unknown}};
  const data=body.data;
  if(!data||data.warning||!(data.success===true&&typeof data.smsBatchId==='string'&&data.smsBatchId.length>0||data.successCount===1&&data.failureCount===0))throw new Error('provider did not accept');
 }catch{throw new DomainError('PHONE_OTP_SEND_FAILED');}
}
