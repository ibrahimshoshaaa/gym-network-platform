import type {Policy} from "./client";
export function normalizeDigits(value:string) {return value.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));}
/** Flutter TopupScreen estimateFor: integer arithmetic and identical rounding. */
export function topupEstimate(policy:Policy|null|undefined,trainee:boolean,value:string,byAmount:boolean) {
  const text=normalizeDigits(value).trim();
  if(!policy||!/^\d+(?:\.\d{1,2})?$/.test(text)||(!byAmount&&text.includes('.')))return null;
  const discount=trainee?0:policy.gymDiscountBps;
  if(discount<0||discount>=10000||!/^\d+$/.test(policy.pointPricePiasters))return null;
  const unit=BigInt(policy.pointPricePiasters)*BigInt(10000-discount);
  if(unit<=0n)return null;
  const [whole,fraction=""]=text.split('.');
  const entered=byAmount?BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0')):BigInt(text);
  const points=byAmount?entered*10000n/unit:entered;
  if(points<=0n||points>2147483647n)return null;
  return {points:Number(points),chargePiasters:((points*unit+9999n)/10000n).toString()};
}
