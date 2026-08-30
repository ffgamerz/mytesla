// ==========================================
// Tesla Proxy - Fleet API (Partner Registered ✅)
// ==========================================
// Partner registered with EC key at tesla-key.ffgamerz.workers.dev
// Uses Fleet API for all data
// ==========================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUTH = 'https://auth.tesla.com/oauth2/v3';
// Tesla Fleet API regional base URLs.
const REGION_URLS = {
  na: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  eu: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
  ap: 'https://fleet-api.prd.ap.vn.cloud.tesla.com',
  cn: 'https://fleet-api.prd.cn.vn.cloud.tesla.com',
};

// Pick the most likely region from the VIN prefix. 404 from other regions is silent,
// so we must start with the correct region to get location data.
//   LRW = Shanghai (China)  -> cn, then ap
//   5YJ = USA (Fremont)     -> na
//   XP7 = Netherlands (EU)  -> eu
function regionOrderForVin(vin?: string | null): string[] {
  const p = (vin || '').slice(0, 3).toUpperCase();
  if (p === 'LRW') return ['cn', 'ap', 'na', 'eu'];
  if (p.startsWith('5YJ')) return ['na', 'eu', 'ap', 'cn'];
  if (p === 'XP7') return ['eu', 'na', 'ap', 'cn'];
  // Default: try all, env override first
  return ['na', 'eu', 'ap', 'cn'];
}

// Try each region (ordered by VIN) until one returns a non-404 response.
async function teslaFetch(path: string, token: string, method = 'GET', body?: unknown, vin?: string | null): Promise<Response> {
  const order = regionOrderForVin(vin);
  const bases = (Deno.env.get('TESLA_FLEET_API_URL')
    ? [Deno.env.get('TESLA_FLEET_API_URL')!]
    : order.map(r => REGION_URLS[r as keyof typeof REGION_URLS]));
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 404) { lastErr = new Error(`${base} -> 404 (vehicle not in region)`); continue; }
      console.log('[tesla-proxy] teslaFetch region hit:', base, path);
      return res;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('All Tesla regions failed');
}
const SU = Deno.env.get('SUPABASE_URL') || '';
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CID = Deno.env.get('TESLA_CLIENT_ID') || '';
const CSEC = Deno.env.get('TESLA_CLIENT_SECRET') || '';
const APP = Deno.env.get('APP_URL') || 'http://localhost:5173';

function cors() {
    return new Headers({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
}
function db() {
    return createClient(SU, SK, { auth: { autoRefreshToken: false, persistSession: false } });
}
function b64url(b: Uint8Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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
            default: return new Response(JSON.stringify({ error: 'Use: authorize, callback, vehicle-data' }), { status: 400, headers: h });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message || 'Error' }), { status: 500, headers: cors() });
    }
});

async function handleAuth(req: Request): Promise<Response> {
    const uid = new URL(req.url).searchParams.get('user_id');
    if (!uid) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: cors() });
    if (!CID) return new Response(JSON.stringify({ error: 'Client ID not configured' }), { status: 500, headers: cors() });

    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const sid = crypto.randomUUID();
    await db().from('tesla_oauth_state').insert({ id: sid, code_verifier: verifier, user_id: uid });

    const url = `${AUTH}/authorize?response_type=code&client_id=${CID}&redirect_uri=${APP}/callback&code_challenge=${challenge}&code_challenge_method=S256&state=${sid}&scope=openid+vehicle_device_data+vehicle_charging_cmds+vehicle_fleet_api+vehicle_location+offline_access`;

    return new Response(null, { status: 302, headers: new Headers({ 'Location': url, 'Access-Control-Allow-Origin': '*' }) });
}

async function handleCallback(req: Request): Promise<Response> {
    const { code, state, user_id } = await req.json();
    if (!code || !state || !user_id) return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400, headers: cors() });

    const d = db();
    const { data: sd } = await d.from('tesla_oauth_state').select('*').eq('id', state).single();
    if (!sd) return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400, headers: cors() });
    await d.from('tesla_oauth_state').delete().eq('id', state);

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

    let vin = null, name = null;
    try {
        const vr = await teslaFetch(`/api/1/vehicles`, at);
        const vd = await vr.json();
        if (vr.ok && vd.response?.length > 0) {
            vin = vd.response[0].vin;
            name = vd.response[0].display_name || `Tesla ${vd.response[0].vehicle_config?.model || ''}`;
        }
    } catch (_) { }

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
    if (!s) return new Response(JSON.stringify({ error: 'No settings. Connect first.' }), { status: 401, headers: cors() });

    const { tesla_client_id: cid, tesla_refresh_token: rt, tesla_vehicle_vin: vin } = s;
    if (!cid || !rt) return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400, headers: cors() });
    if (!vin) return new Response(JSON.stringify({ error: 'No VIN. Add in Settings.' }), { status: 400, headers: cors() });

    // Refresh token with Fleet API scope
    const tr = await fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token', client_id: cid, refresh_token: rt,
            scope: 'openid vehicle_device_data vehicle_charging_cmds vehicle_fleet_api vehicle_location',
        }),
    });
    const td = await tr.json();
    if (!tr.ok) return new Response(JSON.stringify({ error: 'Token expired. Reconnect Tesla.' }), { status: 401, headers: cors() });

    const at = td.access_token, nrt = td.refresh_token || rt;

    await d.from('tesla_user_settings').update({
        tesla_access_token: at, tesla_refresh_token: nrt,
        tesla_token_expiry: new Date(Date.now() + (td.expires_in * 1000)).toISOString(),
    }).eq('id', user_id);

    // Helper: small delay
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Helper: fetch vehicle data
    // IMPORTANT: location_data=true is REQUIRED since firmware 2023.38+ otherwise
    // Tesla returns an empty drive_state (no lat/lng). This restores GPS in drive_state.
    async function fetchVehicleData(token: string) {
        return await teslaFetch(`/api/1/vehicles/${vin}/vehicle_data?location_data=true`, token);
    }

    // Try to get vehicle data (vehicle might be asleep = 408)
    let vr = await fetchVehicleData(at);
    let vd = await vr.json();

    // If vehicle is asleep (408), send wake-up command and retry
    if (vr.status === 408 || vd?.error === 'vehicle unavailable: vehicle is offline or asleep') {
        // Send wake-up command
        await teslaFetch(`/api/1/vehicles/${vin}/wake_up`, at, 'POST');

        // Wait for vehicle to wake up (Tesla recommends 30s, but 10s often enough)
        await sleep(10000);

        // Retry vehicle data
        vr = await fetchVehicleData(at);
        vd = await vr.json();
    }

    if (!vr.ok || !vd.response) {
        return new Response(JSON.stringify({ error: `Vehicle data error (${vr.status})`, details: vd }), { status: 200, headers: cors() });
    }

    const r = vd.response;
    const cs = r.charge_state || {}, vc = r.vehicle_config || {}, cl = r.climate_state || {}, vs = r.vehicle_state || {};

    // --- DRIVE STATE (Location) ---
    // 1) Primary: drive_state from vehicle_data (requires location_data=true since fw 2023.38+)
    const ds = r.drive_state || {};
    console.log('[tesla-proxy] drive_state keys:', Object.keys(ds));
    console.log('[tesla-proxy] drive_state.latitude:', ds.latitude, 'longitude:', ds.longitude);
    console.log('[tesla-proxy] drive_state exists in response:', 'drive_state' in r);

    if (Object.keys(ds).length === 0) {
        console.log('[tesla-proxy] WARNING: drive_state EMPTY even with location_data=true - trying /location endpoint');
    }

    // 2) Fallback A: some Tesla APIs return location under vehicle_state
    const altLat = vs?.latitude ?? null;
    const altLng = vs?.longitude ?? null;
    if (altLat !== null && altLng !== null) {
        console.log('[tesla-proxy] Found location in vehicle_state instead:', altLat, altLng);
    }

    // 3) Fallback B: dedicated /location endpoint (used on fw 2025.2.6+ when drive_state empty)
    let locLat: number | null = ds.latitude ?? altLat ?? null;
    let locLng: number | null = ds.longitude ?? altLng ?? null;

    if (locLat == null || locLng == null) {
        try {
            const lr = await teslaFetch(`/api/1/vehicles/${vin}/location`, at);
            if (lr.ok) {
                const ld = await lr.json();
                const lbody = ld.response ?? ld;
                if (lbody?.latitude != null && lbody?.longitude != null) {
                    locLat = lbody.latitude;
                    locLng = lbody.longitude;
                    console.log('[tesla-proxy] Got location from /location endpoint:', locLat, locLng);
                }
            } else {
                console.log('[tesla-proxy] /location endpoint returned', lr.status);
            }
        } catch (locErr) {
            console.warn('[tesla-proxy] /location fallback failed:', (locErr as Error)?.message || locErr);
        }
    }

    const finalLat = locLat ?? null;
    const finalLng = locLng ?? null;
    console.log('[tesla-proxy] final lat/lng:', finalLat, finalLng);
    // --- END DRIVE STATE ---

    await d.from('tesla_user_settings').update({ tesla_last_sync: new Date().toISOString() }).eq('id', user_id);

    // Tesla Fleet API returns battery_range in miles regardless of user setting.
    // Convert to km for consistent display (1 mile = 1.609 km).
    // est_battery_range is in miles too, convert if present.
    const rawRange = cs.battery_range ?? null;
    const rawEstRange = cs.est_battery_range ?? null;
    const rangeKm = rawRange !== null ? Math.round(rawRange * 1.609 * 100) / 100 : null;
    const estRangeKm = rawEstRange !== null ? Math.round(rawEstRange * 1.609 * 100) / 100 : null;

    return new Response(JSON.stringify({
        battery_level: cs.battery_level ?? null, battery_range: rangeKm,
        estimated_range: estRangeKm, charge_state: cs.charging_state ?? null,
        is_charging: cs.charging_state === 'Charging', charge_power: cs.charge_power ?? null,
        charge_voltage: cs.charge_actual_voltage ?? null, charge_amps: cs.charge_actual_amps ?? null,
        odometer: r.odometer ?? null, locked: vs.locked ?? null, sentry_mode: vs.sentry_mode ?? null,
        inside_temp: cl.inside_temp ?? null, outside_temp: cl.outside_temp ?? null,
        latitude: finalLat, longitude: finalLng,
        model: vc.model ?? null, trim: vc.trim_badging ?? null,
        vin: r.vin ?? null, display_name: r.display_name ?? null,
        timestamp: new Date().toISOString(),
    }), { status: 200, headers: cors() });
}