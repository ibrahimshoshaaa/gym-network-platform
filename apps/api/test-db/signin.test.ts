import assert from "node:assert/strict";
import test,{after} from "node:test";
import {randomUUID} from "node:crypto";
import {PrismaClient,type UserRole} from "@prisma/client";
import {buildApp} from "../src/app.js";
import {hashPassword} from "../src/auth/passwords.js";
const url=new URL(process.env.DATABASE_URL??"");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw new Error("Disposable local test database required");
const db=new PrismaClient();after(async()=>db.$disconnect());
const password="Synthetic single sign-in passphrase!";
async function fixture(){
 const passwordHash=await hashPassword(password);
 const make=(role:UserRole)=>db.user.create({data:{role,displayName:"Synthetic sign-in",email:randomUUID()+"@example.test",phoneE164:"+private"+randomUUID(),password:{create:{passwordHash}}}});
 const admin=await make("PLATFORM_ADMIN"),owner=await make("GYM_OWNER"),trainee=await make("TRAINEE"),cashier=await make("CASHIER"),manager=await make("BRANCH_MANAGER");
 const gym=await db.gym.create({data:{ownerId:owner.id,name:"Synthetic sign-in gym",status:"ACTIVE",ownerAcceptedAt:new Date()}});
 const branch=await db.branch.create({data:{gymId:gym.id,name:"Synthetic sign-in branch",status:"ACTIVE",visitPricePoints:10,sessionMinutes:60}});
 for(const user of [cashier,manager])await db.staffAssignment.create({data:{userId:user.id,branchId:branch.id,role:user.role}});
 return {admin,owner,trainee,cashier,manager};
}
test("one sign-in route resolves all roles without changing verification or session expiry",async t=>{
 const users=await fixture(),app=buildApp(db);t.after(async()=>app.close());
 for(const [role,user] of Object.entries(users)){
  const response=await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:"/auth/signin",payload:{identifier:user.email,password}});
  assert.equal(response.statusCode,200,role);const body=response.json();assert.equal(body.user.role,user.role);assert.equal(body.user.id,user.id);
  const lifetime=Date.parse(body.expiresAt)-Date.now();
  assert.ok(role==="admin"?lifetime<9*3600000:lifetime>6*86400000);
 }
 const denied=await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:"/auth/signin",payload:{identifier:users.trainee.email,password,role:"PLATFORM_ADMIN"}});
 assert.equal(denied.statusCode,400);
 await db.user.update({where:{id:users.cashier.id},data:{isActive:false}});
 assert.equal((await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:"/auth/signin",payload:{identifier:users.cashier.email,password}})).statusCode,401);
 assert.equal((await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:"/auth/signin",payload:{identifier:randomUUID()+"@example.test",password}})).statusCode,401);
});
test("admin login failures are isolated by IP and successful logins do not lock the account",async t=>{
 const users=await fixture(),app=buildApp(db);t.after(async()=>app.close());
 for(let n=0;n<5;n++){
  const result=await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:n===0?"/auth/admin/login":"/auth/signin",payload:{identifier:users.admin.email,password:"incorrect"}});
  assert.equal(result.statusCode,401);
 }
 assert.equal((await app.inject({remoteAddress:"198.51.100.217",method:"POST",url:"/auth/signin",payload:{identifier:users.admin.email,password}})).statusCode,429);
 for(let n=0;n<6;n++)assert.equal((await app.inject({remoteAddress:"198.51.100.218",method:"POST",url:"/auth/signin",payload:{identifier:users.admin.email,password}})).statusCode,200);
});
