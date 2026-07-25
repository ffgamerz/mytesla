// ==========================================
// Tesla Fleet API Proxy - OAuth PKCE Flow
// ==========================================
// Handles:
//   GET  /authorize     - Redirect to Tesla login
//   POST /callback      - Exchange code for tokens
//   POST /refresh-token - Refresh access token
//   POST /vehicle-data  - Get vehicle data
// ==========================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TESLA_AUTH_URL = 'https://auth.tesla.com/oauth2/v3';
const TESLA_API_BASE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TESLA_CLIENT_ID = Deno.env.get('TESLA_CLIENT_ID') || '';
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173';

function base64URLEncode(buffer: Uint8Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function genCodeVerifier(): string {
    const a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return base64URLEncode(a);
}

async function genCodeChallenge(v: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
    return base64URLEncode(new Uint8Array(d));
}

function cors(): Headers {
    return new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
}

function supabase() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

serve(async (req) => {
    const h = cors();
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    try {
        switch (action) {
            case 'authorize': return await handleAuthorize(req);
            case 'callback': return await handleCallback(req);
            case 'vehicle-data': return await handleVehicleData(req);
            default: return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: h });
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Internal error';
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: new Headers({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }) });
    }
});

/**
 * GET /authorize?user_id=xxx
 * Start OAuth flow: redirect to Tesla login
 */
async function handleAuthorize(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    if (!userId) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: cors() });
    if (!TESLA_CLIENT_ID) return new Response(JSON.stringify({ error: 'TESLA_CLIENT_ID not configured' }), { status: 500, headers: cors() });

    const verifier = genCodeVerifier();
    const challenge = await genCodeChallenge(verifier);
    const stateId = crypto.randomUUID();

    const sb = supabase();
    await sb.from('tesla_oauth_state').insert({ id: stateId, code_verifier: verifier, user_id: userId });

    const authUrl = `${TESLA_AUTH_URL}/authorize?response_type=code&client_id=${TESLA_CLIENT_ID}&redirect_uri=${APP_URL}/callback&code_challenge=${challenge}&code_challenge_method=S256&state=${stateId}&scope=openid+vehicle_device_data+vehicle_charging_cmds+vehicle_fleet_api+offline_access`;

    return new Response(null, { status: 302, headers: new Headers({ 'Location': authUrl, 'Access-Control-Allow-Origin': '*' }) });
}

/**
 * POST /callback
 * Body: { code, state, user_id }
 * Exchange code for tokens and store in DB
 */
async function handleCallback(req: Request): Promise<Response> {
    const { code, state, user_id } = await req.json();
    if (!code || !state || !user_id) {
        return new Response(JSON.stringify({ error: 'Missing code, state, or user_id' }), { status: 400, headers: cors() });
    }
    if (!TESLA_CLIENT_ID) return new Response(JSON.stringify({ error: 'TESLA_CLIENT_ID not configured' }), { status: 500, headers: cors() });

    const sb = supabase();

    // Get stored verifier
    const { data: stateData } = await sb.from('tesla_oauth_state').select('*').eq('id', state).single();
    if (!stateData) return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400, headers: cors() });

    // Clean up state
    await sb.from('tesla_oauth_state').delete().eq('id', state);

    // Exchange code for tokens
    const tr = await fetch(`${TESLA_AUTH_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: TESLA_CLIENT_ID,
            code,
            code_verifier: stateData.code_verifier,
            redirect_uri: `${APP_URL}/callback`,
        }),
    });
    const td = await tr.json();
    if (!tr.ok) return new Response(JSON.stringify({ error: 'Token exchange failed', details: td }), { status: 400, headers: cors() });

    const accessToken = td.access_token;
    const refreshToken = td.refresh_token;
    const expiry = new Date(Date.now() + (td.expires_in * 1000)).toISOString();

    // Register partner account
    try {
        await fetch(`${TESLA_API_BASE}/api/1/partner_accounts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: 'supabase.co' }),
        });
    } catch (_) { /* non-fatal */ }

    // Get vehicle info - try listing vehicles first
    let vin = null, name = null;
    try {
        const vr = await fetch(`${TESLA_API_BASE}/api/1/vehicles`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const vd = await vr.json();
        if (vr.ok && vd.response?.length > 0) {
            vin = vd.response[0].vin;
            name = vd.response[0].display_name || `Tesla ${vd.response[0].vehicle_config?.model || ''}`;
        }
    } catch (_) { /* non-fatal */ }

    // Store tokens
    await sb.from('tesla_user_settings').upsert({
        id: user_id,
        tesla_client_id: TESLA_CLIENT_ID,
        tesla_refresh_token: refreshToken,
        tesla_access_token: accessToken,
        tesla_token_expiry: expiry,
        tesla_vehicle_vin: vin,
        tesla_vehicle_name: name || 'Connected',
        tesla_connected: true,
        tesla_last_sync: new Date().toISOString(),
    }, { onConflict: 'id' });

    return new Response(JSON.stringify({ success: true, vin, name }), { status: 200, headers: cors() });
}

/**
 * POST /vehicle-data
 * Body: { user_id }
 */
async function handleVehicleData(req: Request): Promise<Response> {
    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: cors() });

    const sb = supabase();
    const { data: s } = await sb.from('tesla_user_settings').select('*').eq('id', user_id).single();
    if (!s) return new Response(JSON.stringify({ error: 'No settings. Connect Tesla first.' }), { status: 401, headers: cors() });

    const { tesla_client_id: cid, tesla_refresh_token: rt, tesla_vehicle_vin: vin, tesla_vehicle_name: name } = s;
    
    // If VIN is missing, tell user to add VIN in Settings
    if (!cid || !rt) return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400, headers: cors() });
    if (!vin) return new Response(JSON.stringify({ error: 'No VIN configured. Add Vehicle VIN in Settings > Tesla Settings.' }), { status: 400, headers: cors() });

    // Refresh token
    const tr = await fetch(`${TESLA_AUTH_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: cid,
            refresh_token: rt,
            audience: TESLA_API_BASE + '/',
            scope: 'openid vehicle_device_data vehicle_charging_cmds vehicle_fleet_api',
        }),
    });
    const td = await tr.json();
    if (!tr.ok) return new Response(JSON.stringify({ error: 'Token expired. Reconnect Tesla.' }), { status: 401, headers: cors() });

    const at = td.access_token;
    const nrt = td.refresh_token || rt;
    await sb.from('tesla_user_settings').update({ tesla_access_token: at, tesla_refresh_token: nrt, tesla_token_expiry: new Date(Date.now() + (td.expires_in * 1000)).toISOString() }).eq('id', user_id);

    // Register partner account - return register response for debugging
    const regResult = await fetch(`${TESLA_API_BASE}/api/1/partner_accounts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'wvpqllnpataysjqufumy.supabase.co' }),
    });
    const regData = await regResult.json();
    
    // Try vehicle data
    let vr = await fetch(`${TESLA_API_BASE}/api/1/vehicles/${vin}/vehicle_data`, { headers: { 'Authorization': `Bearer ${at}` } });
    let vd = await vr.json();
    
    if (vr.status === 412) {
        await new Promise(r => setTimeout(r, 1000));
        await fetch(`${TESLA_API_BASE}/api/1/partner_accounts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${at}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: '127.0.0.1' }),
        });
        vr = await fetch(`${TESLA_API_BASE}/api/1/vehicles/${vin}/vehicle_data`, { headers: { 'Authorization': `Bearer ${at}` } });
        vd = await vr.json();
    }

    if (!vr.ok || !vd.response) {
        return new Response(JSON.stringify({ error: `Vehicle data error`, register: regData, details: vd }), { status: 200, headers: cors() });
    }
    
    const r = vd.response;
    const cs = r.charge_state || {};
    const ds = r.drive_state || {};
    const vc = r.vehicle_config || {};
    const cl = r.climate_state || {};
    const vs = r.vehicle_state || {};

    await sb.from('tesla_user_settings').update({ tesla_last_sync: new Date().toISOString() }).eq('id', user_id);

    return new Response(JSON.stringify({
        battery_level: cs.battery_level,
        battery_range: cs.battery_range,
        estimated_range: cs.est_battery_range,
        charge_state: cs.charging_state,
        is_charging: cs.charging_state === 'Charging',
        charge_power: cs.charge_power,
        charge_voltage: cs.charge_actual_voltage,
        charge_amps: cs.charge_actual_amps,
        odometer: r.odometer,
        locked: vs.locked,
        sentry_mode: vs.sentry_mode,
        inside_temp: cl.inside_temp,
        outside_temp: cl.outside_temp,
        latitude: ds.latitude,
        longitude: ds.longitude,
        model: vc.model,
        trim: vc.trim_badging,
        vin: r.vin,
        display_name: r.display_name,
        timestamp: new Date().toISOString(),
    }), { status: 200, headers: cors() });
}