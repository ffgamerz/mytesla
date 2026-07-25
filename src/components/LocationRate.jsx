import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLocations, saveLocation, updateLocation, deleteLocation } from '../../supabase/client';
import MapPicker from './MapPicker';

// ~100 meters in degrees (rough approximation at equator)
const PROXIMITY_THRESHOLD = 0.001;

/**
 * Calculate distance between two coordinates in meters
 */
function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Reverse geocode using OpenStreetMap Nominatim
 */
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        if (data && data.display_name) {
            const parts = data.display_name.split(', ');
            // Return a short name: road + suburb + city
            const road = data.address?.road || '';
            const suburb = data.address?.suburb || data.address?.neighbourhood || '';
            const city = data.address?.city || data.address?.town || data.address?.village || '';
            return [road, suburb, city].filter(Boolean).slice(0, 3).join(', ') || data.display_name.split(', ').slice(0, 3).join(', ');
        }
        return null;
    } catch {
        return null;
    }
}

function LocationRate({ selectedLocation, onLocationChange, teslaCoordinate }) {
    const { user } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [dbLocations, setDbLocations] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editRate, setEditRate] = useState('0.38');
    const [editVoltage, setEditVoltage] = useState('240');
    const [editMaxAmps, setEditMaxAmps] = useState('32');
    const [editIcon, setEditIcon] = useState('home');
    const [editLat, setEditLat] = useState(null);
    const [editLng, setEditLng] = useState(null);
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [geoStatus, setGeoStatus] = useState(''); // '', 'detecting', 'detected', 'error'
    const [geoLat, setGeoLat] = useState(null);
    const [geoLng, setGeoLng] = useState(null);
    const [geoAddress, setGeoAddress] = useState('');
    const [foundNearby, setFoundNearby] = useState(null);
    const [teslaLocPrompt, setTeslaLocPrompt] = useState(null); // { lat, lng } when unsaved Tesla location
    const [inlineAddMode, setInlineAddMode] = useState(false);
    const [inlineAddName, setInlineAddName] = useState('');
    const [inlineAddRate, setInlineAddRate] = useState('0.38');
    const [inlineAddVoltage, setInlineAddVoltage] = useState('240');
    const [inlineAddAmps, setInlineAddAmps] = useState('32');

    // Load all locations from database
    const loadLocations = async () => {
        if (!user) return;
        try {
            const locs = await getLocations(user.id);
            setDbLocations(locs);

            // Auto-select first location if none selected
            if (initialLoad && locs.length > 0 && !selectedLocation) {
                onLocationChange(formatLoc(locs[0]));
            }
            setInitialLoad(false);
        } catch (e) {
            console.error('Failed to load locations:', e);
        }
    };

    useEffect(() => {
        if (user) {
            loadLocations();
        }
    }, [user]);

    // On load (after locations ready), detect phone GPS and auto-select nearest
    useEffect(() => {
        if (!dbLocations.length || !user) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    // Check if any saved location is nearby
                    let nearest = null;
                    let nearestDist = Infinity;
                    for (const loc of dbLocations) {
                        if (loc.latitude && loc.longitude) {
                            const dist = calcDistance(lat, lng, loc.latitude, loc.longitude);
                            if (dist < nearestDist) {
                                nearestDist = dist;
                                nearest = loc;
                            }
                        }
                    }

                    if (nearest && nearestDist < 100 && selectedLocation?.db_id !== nearest.id) {
                        onLocationChange(formatLoc(nearest));
                    }
                },
                () => { /* GPS failed */ },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    }, [dbLocations.length, user]);

    // Auto-detect location from Tesla coordinates (only when pulled)
    // Shows a prompt to save new location if none nearby
    useEffect(() => {
        if (!teslaCoordinate) return;

        const { lat, lng } = teslaCoordinate;

        // Check if any saved location is nearby
        let nearest = null;
        let nearestDist = Infinity;
        for (const loc of dbLocations) {
            if (loc.latitude && loc.longitude) {
                const dist = calcDistance(lat, lng, loc.latitude, loc.longitude);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = loc;
                }
            }
        }

        if (nearest && nearestDist < 100) {
            // Within 100 meters - auto-select
            if (selectedLocation?.db_id !== nearest.id) {
                onLocationChange(formatLoc(nearest));
            }
            setTeslaLocPrompt(null);
        } else {
            // No saved location nearby — show prompt, but don't auto-save
            setTeslaLocPrompt({ lat, lng });
        }
    }, [teslaCoordinate?.lat, teslaCoordinate?.lng, dbLocations, selectedLocation?.db_id, onLocationChange]);

    const formatLoc = (loc) => ({
        db_id: loc.id,
        name: loc.name,
        rate: loc.rate,
        voltage: loc.voltage,
        maxAmps: loc.max_amps,
        icon: loc.icon || 'home',
        latitude: loc.latitude,
        longitude: loc.longitude,
    });

    const handleSelect = (loc) => {
        onLocationChange(formatLoc(loc));
        setShowModal(false);
    };

    const handleSaveLocation = async () => {
        if (!user || !editName.trim()) return;
        setLoading(true);
        try {
            const locationData = {
                name: editName.trim(),
                rate: parseFloat(editRate) || 0.38,
                voltage: parseInt(editVoltage) || 240,
                max_amps: parseInt(editMaxAmps) || 32,
                icon: editIcon,
                latitude: editLat,
                longitude: editLng,
            };

            if (editId) {
                await updateLocation(editId, locationData);
            } else {
                await saveLocation(user.id, locationData);
            }

            await loadLocations();

            setIsEditing(false);
            setEditId(null);
            setShowModal(false);
        } catch (e) {
            console.error('Failed to save location:', e);
        }
        setLoading(false);
    };

    const handleDeleteLocation = async (locId) => {
        if (!user) return;
        try {
            await deleteLocation(locId);
            await loadLocations();
            if (selectedLocation?.db_id === locId && dbLocations.length > 1) {
                const remaining = dbLocations.filter(l => l.id !== locId);
                if (remaining.length > 0) handleSelect(remaining[0]);
            }
        } catch (e) {
            console.error('Failed to delete location:', e);
        }
    };

    const startEdit = (loc) => {
        setEditId(loc.id);
        setEditName(loc.name);
        setEditRate(loc.rate.toString());
        setEditVoltage(loc.voltage.toString());
        setEditMaxAmps(loc.max_amps.toString());
        setEditIcon(loc.icon || 'home');
        setEditLat(loc.latitude || null);
        setEditLng(loc.longitude || null);
        setIsEditing(true);
    };

    const startNew = (prefillName, prefillLat, prefillLng) => {
        setEditId(null);
        setEditName(prefillName || '');
        setEditRate('0.38');
        setEditVoltage('240');
        setEditMaxAmps('32');
        setEditIcon('location_on');
        setEditLat(prefillLat || null);
        setEditLng(prefillLng || null);
        setIsEditing(true);
    };

    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            setGeoStatus('error');
            return;
        }

        setGeoStatus('detecting');
        setFoundNearby(null);
        setGeoAddress('');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setGeoLat(lat);
                setGeoLng(lng);

                // Try to get address
                const address = await reverseGeocode(lat, lng);
                setGeoAddress(address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);

                // Check if any saved location is nearby
                let nearest = null;
                let nearestDist = Infinity;
                for (const loc of dbLocations) {
                    if (loc.latitude && loc.longitude) {
                        const dist = calcDistance(lat, lng, loc.latitude, loc.longitude);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearest = loc;
                        }
                    }
                }

                if (nearest && nearestDist < 100) {
                    // Within 100 meters - auto-select
                    setGeoStatus('detected');
                    setFoundNearby(nearest);
                } else {
                    setGeoStatus('detected');
                    setFoundNearby(null);
                    // Auto-fill add form with detected address
                    startNew(address || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng);
                }
            },
            (err) => {
                setGeoStatus('error');
                console.error('Geolocation error:', err);
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    const handleConfirmNearby = (loc) => {
        handleSelect(loc);
        setGeoStatus('');
        setFoundNearby(null);
    };

    const handleSaveDetectedLocation = async () => {
        if (!user || !geoLat || !geoLng) return;
        setLoading(true);
        try {
            const name = geoAddress || `Location (${geoLat.toFixed(4)}, ${geoLng.toFixed(4)})`;
            const newLoc = await saveLocation(user.id, {
                name,
                rate: 0.38,
                voltage: 240,
                max_amps: 32,
                icon: 'location_on',
                latitude: geoLat,
                longitude: geoLng,
            });

            await loadLocations();
            handleSelect(newLoc);
            setGeoStatus('');
            setFoundNearby(null);
        } catch (e) {
            console.error('Failed to save location:', e);
        }
        setLoading(false);
    };

    const handleOpen = () => {
        setIsEditing(false);
        setEditId(null);
        setGeoStatus('');
        setFoundNearby(null);
        setShowModal(true);
    };

    const handleInlineAdd = async () => {
        if (!user || !teslaLocPrompt || !inlineAddName.trim()) return;
        setLoading(true);
        try {
            const newLoc = await saveLocation(user.id, {
                name: inlineAddName.trim(),
                rate: parseFloat(inlineAddRate) || 0.38,
                voltage: parseInt(inlineAddVoltage) || 240,
                max_amps: parseInt(inlineAddAmps) || 32,
                icon: 'location_on',
                latitude: teslaLocPrompt.lat,
                longitude: teslaLocPrompt.lng,
            });
            await loadLocations();
            onLocationChange(formatLoc(newLoc));
            setTeslaLocPrompt(null);
            setInlineAddMode(false);
        } catch (e) {
            console.error('Failed to save:', e);
        }
        setLoading(false);
    };

    const handleAddTeslaLocation = async () => {
        if (!user || !teslaLocPrompt) return;
        // Reverse geocode to get name suggestion
        const address = await reverseGeocode(teslaLocPrompt.lat, teslaLocPrompt.lng);
        setInlineAddName(address || `Location (${teslaLocPrompt.lat.toFixed(4)}, ${teslaLocPrompt.lng.toFixed(4)})`);
        setInlineAddMode(true);
    };

    const currentLocation = selectedLocation || { name: 'Select Location', rate: 0, voltage: 240, icon: 'home' };

    // Modal
    if (showModal) {
        return (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
                <div className="modal-sheet" onClick={e => e.stopPropagation()}>
                    <div className="modal-handle"></div>

                    {isEditing ? (
                        <>
                            <div className="modal-title">
                                {editId ? 'Edit Location' : 'New Location'}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Location Name</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    placeholder="e.g. My Home"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Rate (RM/kWh)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="5"
                                    className="form-control-custom"
                                    value={editRate}
                                    onChange={e => setEditRate(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Voltage (V)</label>
                                <input
                                    type="number"
                                    step="10"
                                    min="100"
                                    max="1000"
                                    className="form-control-custom"
                                    value={editVoltage}
                                    onChange={e => setEditVoltage(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Max Amps (A)</label>
                                <input
                                    type="number"
                                    step="1"
                                    min="5"
                                    max="500"
                                    className="form-control-custom"
                                    value={editMaxAmps}
                                    onChange={e => setEditMaxAmps(e.target.value)}
                                />
                            </div>

                            {/* Map */}
                            <div className="form-group">
                                <label className="form-label">Pin Location on Map</label>
                                <MapPicker
                                    latitude={editLat}
                                    longitude={editLng}
                                    onLocationChange={(lat, lng) => {
                                        setEditLat(lat);
                                        setEditLng(lng);
                                    }}
                                />
                            </div>

                            <button
                                className="btn-primary-custom mt-3"
                                onClick={handleSaveLocation}
                                disabled={loading || !editName.trim()}
                            >
                                <span className="material-symbols-outlined">save</span>
                                {loading ? 'Saving...' : editId ? 'Update Location' : 'Add Location'}
                            </button>

                            <button className="modal-close-btn" onClick={() => setIsEditing(false)}>
                                Back
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="modal-title">Select Location</div>

                            {/* Geolocation Button */}
                            <button
                                className="geo-btn"
                                onClick={handleDetectLocation}
                                disabled={geoStatus === 'detecting'}
                            >
                                <span className="material-symbols-outlined geo-btn-icon">
                                    {geoStatus === 'detecting' ? 'radar' : 'my_location'}
                                </span>
                                {geoStatus === 'detecting' ? 'Detecting...' : 'Detect My Location'}
                            </button>

                            {/* Geolocation Status */}
                            {geoStatus === 'error' && (
                                <div className="geo-status geo-error">
                                    <span className="material-symbols-outlined">gps_off</span>
                                    Could not detect location. Enable GPS and try again.
                                </div>
                            )}

                            {geoStatus === 'detected' && foundNearby && (
                                <div className="geo-status geo-nearby">
                                    <div className="geo-nearby-header">
                                        <span className="material-symbols-outlined">near_me</span>
                                        <span>Nearby Location Found</span>
                                    </div>
                                    <p className="geo-address">{geoAddress}</p>
                                    <div className="geo-nearby-loc">
                                        <span className="material-symbols-outlined geo-nearby-icon">
                                            {foundNearby.icon || 'home'}
                                        </span>
                                        <div>
                                            <div className="geo-nearby-name">{foundNearby.name}</div>
                                            <div className="geo-nearby-dist">~{Math.round(calcDistance(geoLat, geoLng, foundNearby.latitude, foundNearby.longitude))}m away</div>
                                        </div>
                                    </div>
                                    <div className="geo-nearby-actions">
                                        <button
                                            className="btn-primary-custom"
                                            onClick={() => handleConfirmNearby(foundNearby)}
                                        >
                                            <span className="material-symbols-outlined">check</span>
                                            Use This Location
                                        </button>
                                        <button
                                            className="btn-save"
                                            onClick={handleSaveDetectedLocation}
                                            disabled={loading}
                                        >
                                            <span className="material-symbols-outlined">add_location</span>
                                            Save as New
                                        </button>
                                    </div>
                                </div>
                            )}

                            {geoStatus === 'detected' && !foundNearby && geoAddress && (
                                <div className="geo-status geo-new">
                                    <div className="geo-nearby-header">
                                        <span className="material-symbols-outlined">add_location</span>
                                        <span>New Location Detected</span>
                                    </div>
                                    <p className="geo-address">{geoAddress}</p>
                                    <button
                                        className="btn-save"
                                        onClick={handleSaveDetectedLocation}
                                        disabled={loading}
                                    >
                                        <span className="material-symbols-outlined">save</span>
                                        Save This Location
                                    </button>
                                </div>
                            )}

                            {/* Saved Locations */}
                            {dbLocations.length === 0 ? (
                                <div className="history-empty">
                                    <span className="material-symbols-outlined empty-icon">location_off</span>
                                    <p>No locations yet.</p>
                                    <p className="text-muted">Use the button above to detect your current location!</p>
                                </div>
                            ) : (
                                dbLocations.map(loc => (
                                    <div key={loc.id} className="modal-option-wrap">
                                        <button
                                            className={`modal-option ${selectedLocation?.db_id === loc.id ? 'selected' : ''}`}
                                            onClick={() => handleSelect(loc)}
                                        >
                                            <span className="material-symbols-outlined modal-option-icon">
                                                {loc.icon || 'home'}
                                            </span>
                                            <div className="modal-option-info">
                                                <div className="modal-option-label">{loc.name}</div>
                                                <div className="modal-option-sub">
                                                    RM {loc.rate.toFixed(2)}/kWh &middot; {loc.voltage}V &middot; Max {loc.max_amps}A
                                                    {loc.latitude && <span className="loc-has-geo"> &middot; 📍</span>}
                                                </div>
                                            </div>
                                            {selectedLocation?.db_id === loc.id && (
                                                <span className="tag tag-blue">Active</span>
                                            )}
                                        </button>
                                        <div className="modal-option-actions">
                                            <button className="action-btn" onClick={() => startEdit(loc)}>
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                            <button
                                                className="action-btn danger"
                                                onClick={() => handleDeleteLocation(loc.id)}
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}

                            <button
                                className="btn-save mt-3"
                                onClick={() => startNew('', null, null)}
                            >
                                <span className="material-symbols-outlined btn-save-icon">add_location</span>
                                Add New Location Manually
                            </button>

                            <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="location-display" onClick={handleOpen}>
                <div className="location-icon-box">
                    <span className="material-symbols-outlined loc-icon-symbol">
                        {currentLocation.icon || 'home'}
                    </span>
                </div>
                <div className="location-info">
                    <div className="location-name">{currentLocation.name}</div>
                    <div className="location-rate">
                        RM {currentLocation.rate.toFixed(2)} / kWh &middot;{' '}
                        {currentLocation.voltage}V
                    </div>
                </div>
                <button className="location-change-btn" onClick={handleOpen}>
                    Change <span className="material-symbols-outlined expand-icon">expand_more</span>
                </button>
            </div>

            {/* Prompt to save new Tesla location */}
            {teslaLocPrompt && !inlineAddMode && (
                <div className="location-save-prompt">
                    <span className="material-symbols-outlined location-save-prompt-icon">add_location</span>
                    <div className="location-save-prompt-info">
                        <strong>New location detected</strong><br />
                        No saved charging location at this spot.
                    </div>
                    <button className="location-save-prompt-btn" onClick={handleAddTeslaLocation}>
                        <span className="material-symbols-outlined" style={{fontSize: 16}}>add</span>
                        Add
                    </button>
                </div>
            )}
            {teslaLocPrompt && inlineAddMode && (
                <div className="card-custom" style={{marginTop: 8, padding: 16}}>
                    <div className="card-custom-title" style={{marginBottom: 10}}>
                        <span className="material-symbols-outlined card-title-icon">add_location</span>
                        Add This Location
                    </div>
                    <div className="form-group">
                        <label className="form-label">Name</label>
                        <input type="text" className="form-control-custom"
                            placeholder="e.g. My Home"
                            value={inlineAddName}
                            onChange={e => setInlineAddName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Rate (RM/kWh)</label>
                        <input type="number" step="0.01" min="0" max="5"
                            className="form-control-custom"
                            value={inlineAddRate}
                            onChange={e => setInlineAddRate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Voltage (V)</label>
                        <input type="number" step="10" min="100" max="1000"
                            className="form-control-custom"
                            value={inlineAddVoltage}
                            onChange={e => setInlineAddVoltage(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Max Amps (A)</label>
                        <input type="number" step="1" min="5" max="500"
                            className="form-control-custom"
                            value={inlineAddAmps}
                            onChange={e => setInlineAddAmps(e.target.value)} />
                    </div>
                    <div style={{display: 'flex', gap: 8}}>
                        <button className="btn-primary-custom" onClick={handleInlineAdd}
                            disabled={loading || !inlineAddName.trim()}
                            style={{flex: 1}}>
                            <span className="material-symbols-outlined">save</span>
                            {loading ? 'Saving...' : 'Save Location'}
                        </button>
                        <button className="btn-save" onClick={() => {setInlineAddMode(false); setTeslaLocPrompt(null);}}
                            style={{flex: '0 0 auto', padding: '14px 16px', width: 'auto'}}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default LocationRate;