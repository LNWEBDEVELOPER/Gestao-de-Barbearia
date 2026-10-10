import { createClient } from './vendor/supabase.js';
const config = window.BARBER_CONFIG || {};
function isPublicKey(key) {
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '')) return true;
    try { const body=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(atob(body)).role==='anon'; } catch { return false; }
}
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') && isPublicKey(config.supabasePublishableKey);
export const cloud = configured ? createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
let identity, identityVersion=0;
cloud?.auth.onAuthStateChange((_event,session)=>{
    const next=session?.user?.id;
    if(next!==identity){identity=next;identityVersion++;}
});
export async function rpc(action,payload={}) {
    if (!cloud) throw new Error('O acesso online ainda não foi configurado.');
    const {data:before,error:sessionError}=await cloud.auth.getSession();
    if(sessionError)throw sessionError;
    if(!before.session)throw new Error('Entre na sua conta para continuar.');
    const version=identityVersion;
    const {data,error}=await cloud.rpc('barber_account_api',{action,payload});
    if(error) throw error;
    const {data:after}=await cloud.auth.getSession();
    if(version!==identityVersion||after.session?.user.id!==before.session.user.id)throw new Error('A conta mudou. Atualize a tela para continuar.');
    return data;
}
