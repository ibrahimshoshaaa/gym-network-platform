"use client";
import type {Identity} from '../lib/client';
import {AccountTools} from './updates';
/** The same wordmark, app-bar height and notification placement as Flutter. */
export function PortalHeader({user,onNavigate}:{user:Identity;onNavigate:(destination:string)=>void}){
 return <header className="trainee-header portal-app-header"><img src="/brand/gymbank-wordmark.png" alt="GymBank" width={152} height={38}/><AccountTools compact user={user} onNavigate={onNavigate}/></header>;
}
