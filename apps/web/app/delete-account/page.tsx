import type { Metadata } from 'next';
import { PublicAccountDeletion } from '../../components/account-deletion';
export const metadata:Metadata={title:'حذف حساب GymBank',description:'طلب حذف حساب GymBank وبياناته من الموقع بدون إعادة تثبيت التطبيق.'};
export default function DeleteAccountPage(){return <main style={{maxWidth:640,margin:'32px auto',padding:20}}><a href="/">GymBank</a><h1>حذف الحساب وبياناته</h1><PublicAccountDeletion/></main>;}
