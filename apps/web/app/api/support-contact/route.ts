import {failure,json,upstream} from '../../../lib/gateway';
export const runtime='nodejs';
export async function GET(){try{const response=await upstream('public/support-contact');return json(await response.json(),response.status);}catch(e){return failure(e);}}
