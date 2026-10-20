export const roleTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["booking-policy","campaigns","requests","finance","more","home","gym-applications","direct-topup","reviews","branch-prices","gyms","reports","inventory","withdrawals","disputes","operation-reviews","pricing","payments","packages","support","users","audit"],
 GYM_OWNER: ["home","point-wallet","gyms","purchases","cashier","inventory","reports","withdrawals","disputes","operation-reviews","support"],
 BRANCH_MANAGER: ["home","cashier","gyms","inventory","reports","operation-reviews","support"],
 CASHIER: ["home","cashier","reports","operation-reviews","support"],
 TRAINEE: [],
};
export const roleQuickTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["home","requests","gyms","finance"],
 GYM_OWNER: ["home","point-wallet","gyms"],
 BRANCH_MANAGER: ["home","cashier","inventory"],
 CASHIER: ["home","cashier","reports"],
};
const roleNames: Record<string,string> = { PLATFORM_ADMIN:"صاحب المنصة",GYM_OWNER:"صاحب الجيم",BRANCH_MANAGER:"مدير الفرع",CASHIER:"الكاشير",TRAINEE:"متدرب" };
export const roleName = (role: string) => roleNames[role] ?? "حساب المنصة";


/** Admin destinations stay reachable through five task-oriented sections. */
export const adminSections = [
 {id:"home",label:"الرئيسية",description:"ابدأ بالطلبات التي تحتاج تدخلك",items:[]},
 {id:"requests",label:"الطلبات",description:"راجع الطلب واختر القرار من مكان واحد",items:["booking-policy","reviews","gym-applications","branch-prices","operation-reviews","withdrawals"]},
 {id:"gyms",label:"الجيمات",description:"الجيمات والفروع وبيانات التشغيل",items:[]},
 {id:"finance",label:"المالية",description:"التحصيلات والمستحقات وحركة النقاط",items:["direct-topup","inventory","disputes","reports"]},
 {id:"more",label:"المزيد",description:"الدعم والمستخدمون وإعدادات المنصة",items:["campaigns","support","users","pricing","payments","packages","audit"]},
] as const;
export function adminSectionFor(destination:string) {
 return adminSections.find(section=>section.id===destination || (section.items as readonly string[]).includes(destination)) ?? adminSections[0];
}
