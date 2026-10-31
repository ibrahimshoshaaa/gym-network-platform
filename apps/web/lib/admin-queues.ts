import type {AdminDestination} from './navigation';
export const adminQueues:readonly {label:string;title:string;description:string;destination:AdminDestination;view?:string}[]=[
 {label:'شحن ينتظر المراجعة',title:'طلبات الشحن',description:'راجع الإيصال واعتمد إضافة النقاط.',destination:'reviews'},
 {label:'طلبات انضمام الجيمات',title:'انضمام الجيمات',description:'راجع بيانات صاحب الجيم وطلبه.',destination:'gym-applications'},
 {label:'سحب ينتظر المراجعة',title:'طلبات السحب',description:'راجع المبلغ وبيانات الاستلام.',destination:'withdrawals'},
 {label:'تحويلات تنتظر التنفيذ',title:'تحويلات جاهزة للتنفيذ',description:'سجّل التحويل وإثباته للطلبات المقبولة.',destination:'withdrawals'},
 {label:'طلبات أسعار',title:'أسعار الزيارات',description:'اعتمد سعر الزيارة ومدتها.',destination:'branch-prices'},
 {label:'أسعار خدمات تنتظر المراجعة',title:'أسعار الخدمات',description:'اعتمد الخدمة وسعرها ومدتها ومواعيدها.',destination:'service-prices'},
 {label:'إعلانات فروع تنتظر المراجعة',title:'إعلانات الفروع',description:'راجع الإعلان وحدد تكلفة وموعد الظهور.',destination:'promotion-requests'},
 {label:'إعلانات ماركت تنتظر المراجعة',title:'إعلانات الماركت',description:'راجع المعروض وانشر المناسب.',destination:'market'},
 {label:'بلاغات ماركت مفتوحة',title:'بلاغات الماركت',description:'راجع الإعلانات التي أُبلغ عنها.',destination:'market',view:'REPORTS'},
 {label:'حجوزات تنتظر القرار',title:'عدم الحضور',description:'راجع الحجز وقرر توزيع النقاط.',destination:'booking-reviews'},
 {label:'طلبات تصحيح',title:'الإلغاء والتصحيح',description:'راجع العملية والأدلة وتأثير القرار.',destination:'operation-reviews'},
 {label:'صيانة تحتاج متابعة',title:'طلبات الصيانة',description:'طلبات جديدة أو تحت المراجعة أو جاهزة للتنفيذ.',destination:'maintenance'},
 {label:'طلبات حذف تحتاج مراجعة',title:'حذف الحسابات',description:'راجع الطلب وعوائق التسوية.',destination:'account-deletions'},
 {label:'جيمات تنتظر التفعيل',title:'تفعيل الجيمات',description:'الجيمات التي استكملت قبول الدعوة.',destination:'gyms'},
 {label:'طلبات دعم مفتوحة',title:'رسائل الدعم',description:'تابع الرسائل المفتوحة وردود العملاء.',destination:'support'},
];
export type AdminSummary={asOf:string;cards:{label:string;value:string;destination:string;unit?:string}[]};
export function queueCounts(summary:AdminSummary|null){
 const counts:Partial<Record<AdminDestination,number>>={};
 for(const q of adminQueues){const card=summary?.cards.find(c=>c.label===q.label);if(!card)continue;const n=Number(card.value);if(Number.isSafeInteger(n)&&n>=0)counts[q.destination]=(counts[q.destination]??0)+n;}
 return counts;
}
