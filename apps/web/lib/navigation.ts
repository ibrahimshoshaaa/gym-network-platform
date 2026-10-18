export const roleTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["home","direct-topup","reviews","branch-prices","gyms","reports","inventory","withdrawals","disputes","operation-reviews","pricing","payments","packages","support","users","audit"],
 GYM_OWNER: ["home","point-wallet","gyms","purchases","cashier","inventory","reports","withdrawals","disputes","operation-reviews","support"],
 BRANCH_MANAGER: ["home","cashier","gyms","inventory","reports","operation-reviews","support"],
 CASHIER: ["home","cashier","reports","operation-reviews","support"],
 TRAINEE: [],
};
export const roleQuickTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["home","reviews","gyms"],
 GYM_OWNER: ["home","point-wallet","gyms"],
 BRANCH_MANAGER: ["home","cashier","inventory"],
 CASHIER: ["home","cashier","reports"],
};
const roleNames: Record<string,string> = { PLATFORM_ADMIN:"صاحب المنصة",GYM_OWNER:"صاحب الجيم",BRANCH_MANAGER:"مدير الفرع",CASHIER:"الكاشير",TRAINEE:"متدرب" };
export const roleName = (role: string) => roleNames[role] ?? "حساب المنصة";
