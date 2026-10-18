export const roleTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["home","reviews","branch-prices","gyms","reports","inventory","withdrawals","operation-reviews","pricing","payments","packages"],
 GYM_OWNER: ["home","gyms","purchases","cashier","inventory","reports","withdrawals","operation-reviews"],
 BRANCH_MANAGER: ["home","cashier","gyms","inventory","reports","operation-reviews"],
 CASHIER: ["home","cashier","reports","operation-reviews"],
 TRAINEE: [],
};
export const roleQuickTabs: Record<string, readonly string[]> = {
 PLATFORM_ADMIN: ["home","reviews","gyms"],
 GYM_OWNER: ["home","gyms","cashier"],
 BRANCH_MANAGER: ["home","cashier","inventory"],
 CASHIER: ["home","cashier","reports"],
};
const roleNames: Record<string,string> = { PLATFORM_ADMIN:"صاحب المنصة",GYM_OWNER:"صاحب الجيم",BRANCH_MANAGER:"مدير الفرع",CASHIER:"الكاشير",TRAINEE:"متدرب" };
export const roleName = (role: string) => roleNames[role] ?? "حساب المنصة";
