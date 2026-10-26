import {GatewayError,allowedPath} from "./security";
export function requirePlatformAdmin(user:{role:string}|null|undefined){
 if(!user)throw new GatewayError("UNAUTHENTICATED",401);
 if(user.role!=="PLATFORM_ADMIN")throw new GatewayError("ACCESS_DENIED",403);
 return user;
}
/** Cookie-authorized browser routes; the native bearer bridge keeps its own scope. */
export function allowedAdminPath(method:string,path:string){
 if(!allowedPath(method,path))return false;
 if(path.startsWith("admin/"))return true;
 if(method==="GET"&&/^(home-summary|notifications|disputes|support\/(contact|tickets)|support\/tickets\/[0-9a-f-]{36}|reports\/(gyms|summary|rows|export|platform-balances)|reports\/gyms\/[0-9a-f-]{36}\/branches|receipts\/[0-9a-f-]{36}\/access|withdrawals\/[0-9a-f-]{36})$/i.test(path))return true;
 if(method==="POST"&&/^(notifications\/read|auth\/password\/change|receipts|support\/tickets\/[0-9a-f-]{36}\/(messages|status)|invitations\/[0-9a-f-]{36}\/revoke)$/i.test(path))return true;
 if(method==="PATCH"&&path==="me/profile")return true;
 // Platform management of branches, images, pricing history and staff. The API
 // additionally verifies the actor and exact resource permissions.
 return /^gyms\/[0-9a-f-]{36}(?:\/(?:branches|staff|images|invitations|staff-invitations|delegations)(?:\/[0-9a-f-]{36})?(?:\/(?:pricing-history|remove|approve-setup))?)?$/i.test(path);
}
