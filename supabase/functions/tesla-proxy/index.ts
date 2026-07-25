// ==========================================
// Tesla Proxy - Owner API Only
// ==========================================
// Uses Owner API (legacy) - no partner registration needed.
// OAuth PKCE with minimal scope (openid + vehicle_device_data).
// Refresh token - no audience (Owner API compatible).
// ==========================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUTH = 'https://auth.tesla.com/oauth2/v3';
const API = 'https://owner-api.teslamotors.com';
const SU = Deno.env.get('SUPABASE_URL') || '';
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CID = Deno.env.get('TESLA_CLIENT_ID') || '';
const APP = Deno.env.get('APP_URL') || 'http://localhost:5173';

function cors() {
    return new Headers({'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
}
function db() {
    return createClient(SU, SK, { auth: { autoRefreshToken: false, persistSession: false } });
}
function b64(b: Uint8Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

serve(async (req) => {
    const h = cors();
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const action = new URL(req.url).pathname.split('/').pop();
    try {
        switch (action) {
            case 'authorize': return await handleAuth(req);
            case 'callback': return await handleCallback(req);
            case 'vehicle-data': return await handleVehicleData(req);
            default: return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: h });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Error' }), { status: 500, headers: cors() });
    }
});

async function handleAuth(req: Request): Promise<Response> {
    const uid = new URL(req.url).searchParams.get('user_id');
    if (!uid) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: cors() });
    if (!CID) return new Response(JSON.stringify({ error: 'Client ID not configured' }), { status: 500, headers: cors() });

    const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const sid = crypto.randomUUID();

    await db().from('tesla_oauth_state').insert({ id: sid, code_verifier: verifier, user_id: uid });

    // Owner API scope - NO vehicle_fleet_api, NO vehicle_charging_cmds
    const url = `${AUTH}/authorize?response_type=code&client_id=${CID}&redirect_uri=${APP}/callback&code_challenge=${challenge}&code_challenge_method=S256&state=${sid}&scope=openid+vehicle_device_data+offline_access`;

    return new Response(null, { status: 302, headers: new Headers({ 'Location': url, 'Access-Control-Allow-Origin': '*' }) });
}

async function handleCallback(req: Request): Promise<Response> {
    const { code, state, user_id } = await req.json();
    if (!code || !state || !user_id) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: cors() });

    const d = db();
    const { data: sd } = await d.from('tesla_oauth_state').select('*').eq('id', state).single();
    if (!sd) return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400, headers: cors() });
    await d.from('tesla_oauth_state').delete().eq('id', state);

    // Exchange code - NO audience, NO fleet_api scope
    const tr = await fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code', client_id: CID, code,
            code_verifier: sd.code_verifier, redirect_uri: `${APP}/callback`,
        }),
    });
    const td = await tr.json();
    if (!tr.ok) return new Response(JSON.stringify({ error: 'Token exchange failed', details: td }), { status: 400, headers: cors() });

    const at = td.access_token, rt = td.refresh_token, exp = new Date(Date.now() + (td.expires_in * 1000)).toISOString();

    // Get vehicle info from Owner API
    let vin = null, name = null;
    try {
        const vr = await fetch(`${API}/api/1/vehicles`, { headers: { 'Authorization': `Bearer ${at}` } });
        const vd = await vr.json();
        if (vr.ok && vd.response?.length > 0) {
            vin = vd.response[0].vin;
            name = vd.response[0].display_name || `Tesla ${vd.response[0].vehicle_config?.model || ''}`;
        }
    } catch (_) {}

    await d.from('tesla_user_settings').upsert({
        id: user_id, tesla_client_id: CID, tesla_refresh_token: rt, tesla_access_token: at,
        tesla_token_expiry: exp, tesla_vehicle_vin: vin, tesla_vehicle_name: name || 'Connected',
        tesla_connected: true, tesla_last_sync: new Date().toISOString(),
    }, { onConflict: 'id' });

    return new Response(JSON.stringify({ success: true, vin, name }), { status: 200, headers: cors() });
}

async function handleVehicleData(req: Request): Promise<Response> {
    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: cors() });

    const d = db();
    const { data: s } = await d.from('tesla_user_settings').select('*').eq('id', user_id).single();
    if (!s) return new Response(JSON.stringify({ error: 'No settings. Connect Tesla first.' }), { status: 401, headers: cors() });

    const cid = s.tesla_client_id, rt = s.tesla_refresh_token, vin = s.tesla_vehicle_vin;
    if (!cid || !rt) return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400, headers: cors() });
    if (!vin) return new Response(JSON.stringify({ error: 'No VIN. Add in Settings.' }), { status: 400, headers: cors() });

    // Refresh token - Owner API style (no audience, no fleet_api scope)
    const tr = await fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', client_id: cid, refresh_token: rt }),
    });
    const td = await tr.json();
    if (!tr.ok) return new Response(JSON.stringify({ error: 'Token expired. Reconnect Tesla.' }), { status: 401, headers: cors() });

    const at = td.access_token, nrt = td.refresh_token || rt;
    await d.from('tesla_user_settings').update({
        tesla_access_token: at, tesla_refresh_token: nrt,
        tesla_token_expiry: new Date(Date.now() + (td.expires_in * 1000)).toISOString(),
    }).eq('id', user_id);

    // Owner API - no registration needed
    const vr = await fetch(`${API}/api/1/vehicles/${vin}/vehicle_data`, { headers: { 'Authorization': `Bearer ${at}` } });
    const vd = await vr.json();
    if (!vr.ok || !vd.response) {
        return new Response(JSON.stringify({ error: `Vehicle data error (${vr.status})`, details: vd }), { status: 200, headers: cors() });
    }

    const r = vd.response;
    const cs = r.charge_state || {}, ds = r.drive_state || {}, vc = r.vehicle_config || {}, cl = r.climate_state || {}, vs = r.vehicle_state || {};
    await d.from('tesla_user_settings').update({ tesla_last_sync: new Date().toISOString() }).eq('id', user_id);

    return new Response(JSON.stringify({
        battery_level: cs.battery_level, battery_range: cs.battery_range,
        estimated_range: cs.est_battery_range, charge_state: cs.charging_state,
        is_charging: cs.charging_state === 'Charging', charge_power: cs.charge_power,
        charge_voltage: cs.charge_actual_voltage, charge_amps: cs.charge_actual_amps,
        odometer: r.odometer, locked: vs.locked, sentry_mode: vs.sentry_mode,
        inside_temp: cl.inside_temp, outside_temp: cl.outside_temp,
        latitude: ds.latitude, longitude: ds.longitude,
        model: vc.model, trim: vc.trim_badging,
        vin: r.vin, display_name: r.display_name,
        timestamp: new Date().toISOString(),
    }), { status: 200, headers: cors() });
}