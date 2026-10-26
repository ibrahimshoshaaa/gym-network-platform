/** Browser navigation belongs exclusively to the platform administrator. */
export const adminSections = [
 {id:"home",label:"الرئيسية",description:"ملخص المنصة والمهام التي تحتاج تدخلك",items:[]},
 {id:"requests",label:"الطلبات والمراجعات",description:"قرارات الشحن والانضمام والأسعار والحضور",items:["reviews","gym-applications","branch-prices","service-prices","booking-reviews","operation-reviews"]},
 {id:"gyms",label:"الجيمات والفروع",description:"إدارة الجيمات والفروع والحسابات المرتبطة بها",items:[]},
 {id:"finance",label:"المالية والتقارير",description:"التحصيلات والمستحقات والسحب والتسويات",items:["direct-topup","withdrawals","disputes","reports","wallet-expiry"]},
 {id:"services",label:"الخدمات والماركت",description:"الصيانة وإعلانات الفروع ومراجعة الماركت",items:["maintenance","promotion-requests","market"]},
 {id:"communication",label:"التواصل",description:"رسائل الدعم وحملات المنصة",items:["support","campaigns"]},
 {id:"oversight",label:"الحسابات والرقابة",description:"إدارة الوصول وطلبات الحذف وسجل القرارات",items:["users","account-deletions","audit"]},
 {id:"settings",label:"إعدادات المنصة",description:"إعدادات التشغيل العامة، مقسمة حسب المهمة",items:["pricing","welcome","payments","packages","booking-policy","support-contact"]},
] as const;
export type AdminSection = typeof adminSections[number]["id"];
export type AdminDestination = AdminSection | typeof adminSections[number]["items"][number];
export const adminDestinations: readonly AdminDestination[] = adminSections.flatMap(section=>[section.id,...section.items]);
export function isAdminDestination(value:unknown): value is AdminDestination {return typeof value==="string" && (adminDestinations as readonly string[]).includes(value);}
export function adminSectionFor(destination:string) {
 return adminSections.find(section=>section.id===destination || (section.items as readonly string[]).includes(destination)) ?? adminSections[0];
}
export const roleTabs = {PLATFORM_ADMIN:adminDestinations};
export const roleQuickTabs = {PLATFORM_ADMIN:["home","requests","gyms","finance","settings"] as const};
const accountRoleNames:Record<string,string>={PLATFORM_ADMIN:"صاحب المنصة",GYM_OWNER:"صاحب الجيم",BRANCH_MANAGER:"مدير الفرع",CASHIER:"الكاشير",TRAINEE:"متدرب"};
export const roleName=(role:string)=>accountRoleNames[role]??"حساب";
