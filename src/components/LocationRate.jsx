import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLocations, saveLocation, deleteLocation } from '../../supabase/client';

const DEFAULT_LOCATIONS = [
    { id: 'home', name: 'Home', rate: 0.38, voltage: 240, icon: 'home', maxAmps: 32 },
    { id: 'office', name: 'Office', rate: 0.45, voltage: 240, icon: 'business', maxAmps: 32 },
    { id: 'supercharger', name: 'Supercharger', rate: 1.20, voltage: 480, icon: 'bolt', maxAmps: 500 },
    { id: 'public_ac', name: 'Public AC', rate: 0.60, voltage: 240, icon: 'location_on', maxAmps: 32 },
];

function LocationRate({ selectedLocation, onLocationChange, onCloseModal }) {
    const { user } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [dbLocations, setDbLocations] = useState([]);
    const [isDetecting, setIsDetecting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editRate, setEditRate] = useState('0.38');
    const [editVoltage, setEditVoltage] = useState('240');
    const [editMaxAmps, setEditMaxAmps] = useState('32');
    const [editingLocationId, setEditingLocationId] = useState(null);
    const [loading, setLoading] = useState(false);

    const allLocations = [...dbLocations, ...DEFAULT_LOCATIONS];
    const [currentDbId, setCurrentDbId] = useState(
        selectedLocation?.db_id || null
    );

    const currentLocation = selectedLocation || DEFAULT_LOCATIONS[0];

    // Load locations from database
    useEffect(() => {
        if (user) {
            loadDbLocations();
        }
    }, [user]);

    const loadDbLocations = async () => {
        try {
            const locs = await getLocations(user.id);
            setDbLocations(locs);
        } catch (e) {
            console.error('Failed to load locations:', e);
        }
    };

    const handleDetectLocation = () => {
        if (!navigator.geolocation) return;
        setIsDetecting(true);
        navigator.geolocation.getCurrentPosition(
            () => setIsDetecting(false),
            () => setIsDetecting(false),
            { timeout: 10000 }
        );
    };

    // Check if a location is from DB or default
    const isDbLocation = (loc) => {
        return loc.id && typeof loc.id === 'string' && loc.id.startsWith('db_');
    };

    const handleSelect = (loc) => {
        // Set as current selection
        const selected = {
            ...loc,
            db_id: loc.id?.toString() || null,
        };
        onLocationChange(selected);
        setShowModal(false);
    };

    const handleSaveNewLocation = async () => {
        if (!user || !editName) return;
        setLoading(true);
        try {
            const newLoc = {
                name: editName,
                rate: parseFloat(editRate) || 0.38,
                voltage: parseInt(editVoltage) || 240,
                max_amps: parseInt(editMaxAmps) || 32,
                icon: 'location_on',
            };

            if (editingLocationId) {
                // Update existing
                await deleteLocation(editingLocationId);
            }

            const saved = await saveLocation(user.id, newLoc);

            // Refresh list
            await loadDbLocations();

            // Auto-select the new location
            onLocationChange({
                id: `db_${saved.id}`,
                db_id: saved.id,
                name: saved.name,
                rate: saved.rate,
                voltage: saved.voltage,
                maxAmps: saved.max_amps,
                icon: saved.icon,
            });

            setIsEditing(false);
            setEditingLocationId(null);
            setShowModal(false);
        } catch (e) {
            console.error('Failed to save location:', e);
        }
        setLoading(false);
    };

    const handleDeleteLocation = async (loc) => {
        if (!user || !loc.db_id) return;
        try {
            await deleteLocation(loc.db_id);
            await loadDbLocations();

            // If deleted location was selected, reset to Home
            if (selectedLocation?.db_id === loc.db_id) {
                onLocationChange(DEFAULT_LOCATIONS[0]);
            }
        } catch (e) {
            console.error('Failed to delete location:', e);
        }
    };

    const handleOpen = () => {
        setIsEditing(false);
        setEditingLocationId(null);
        setEditName('');
        setEditRate('0.38');
        setEditVoltage('240');
        setEditMaxAmps('32');
        setShowModal(true);
    };

    const startEdit = (loc) => {
        setEditingLocationId(loc.db_id);
        setEditName(loc.name);
        setEditRate(loc.rate.toString());
        setEditVoltage(loc.voltage.toString());
        setEditMaxAmps(loc.maxAmps.toString());
        setIsEditing(true);
    };

    // Modal
    if (showModal) {
        return (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
                <div className="modal-sheet" onClick={e => e.stopPropagation()}>
                    <div className="modal-handle"></div>

                    {isEditing ? (
                        <>
                            <div className="modal-title">
                                {editingLocationId ? 'Edit Location' : 'New Custom Location'}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Location Name</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    placeholder="e.g. KL Office"
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

                            <button
                                className="btn-primary-custom mt-3"
                                onClick={handleSaveNewLocation}
                                disabled={loading || !editName}
                            >
                                <span className="material-symbols-outlined">save</span>
                                {loading ? 'Saving...' : 'Save Location'}
                            </button>

                            <button
                                className="modal-close-btn"
                                onClick={() => setIsEditing(false)}
                            >
                                Back
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="modal-title">Select Location</div>

                            <button
                                className="geo-btn"
                                onClick={handleDetectLocation}
                                disabled={isDetecting}
                            >
                                <span className="material-symbols-outlined geo-btn-icon">my_location</span>
                                {isDetecting ? 'Detecting...' : 'Detect My Location'}
                            </button>

                            {/* Saved Locations */}
                            {dbLocations.length > 0 && (
                                <>
                                    <div className="modal-section-label">Saved Locations</div>
                                    {dbLocations.map(loc => (
                                        <div key={loc.id} className="modal-option-wrap">
                                            <button
                                                className={`modal-option ${selectedLocation?.db_id === loc.id ? 'selected' : ''}`}
                                                onClick={() => handleSelect({
                                                    id: `db_${loc.id}`,
                                                    db_id: loc.id,
                                                    name: loc.name,
                                                    rate: loc.rate,
                                                    voltage: loc.voltage,
                                                    maxAmps: loc.max_amps,
                                                    icon: loc.icon || 'location_on',
                                                })}
                                            >
                                                <span className="material-symbols-outlined modal-option-icon">
                                                    {loc.icon || 'location_on'}
                                                </span>
                                                <div className="modal-option-info">
                                                    <div className="modal-option-label">{loc.name}</div>
                                                    <div className="modal-option-sub">
                                                        RM {loc.rate.toFixed(2)}/kWh &middot; {loc.voltage}V &middot; Max {loc.max_amps}A
                                                    </div>
                                                </div>
                                                {selectedLocation?.db_id === loc.id && (
                                                    <span className="tag tag-blue">Active</span>
                                                )}
                                            </button>
                                            <div className="modal-option-actions">
                                                <button
                                                    className="action-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEdit({
                                                            db_id: loc.id,
                                                            name: loc.name,
                                                            rate: loc.rate,
                                                            voltage: loc.voltage,
                                                            maxAmps: loc.max_amps,
                                                        });
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined">edit</span>
                                                </button>
                                                <button
                                                    className="action-btn danger"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteLocation({ db_id: loc.id });
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            <div className="modal-section-label">Default Locations</div>
                            {DEFAULT_LOCATIONS.map(loc => (
                                <button
                                    key={loc.id}
                                    className={`modal-option ${selectedLocation?.id === loc.id && !selectedLocation?.db_id ? 'selected' : ''}`}
                                    onClick={() => handleSelect(loc)}
                                >
                                    <span className="material-symbols-outlined modal-option-icon">{loc.icon}</span>
                                    <div className="modal-option-info">
                                        <div className="modal-option-label">{loc.name}</div>
                                        <div className="modal-option-sub">
                                            RM {loc.rate.toFixed(2)}/kWh &middot; {loc.voltage}V &middot; Max {loc.maxAmps}A
                                        </div>
                                    </div>
                                    {selectedLocation?.id === loc.id && !selectedLocation?.db_id && (
                                        <span className="tag tag-blue">Active</span>
                                    )}
                                </button>
                            ))}

                            <button
                                className="btn-save mt-3"
                                onClick={() => {
                                    setIsEditing(true);
                                    setEditingLocationId(null);
                                    setEditName('');
                                    setEditRate('0.38');
                                    setEditVoltage('240');
                                    setEditMaxAmps('32');
                                }}
                            >
                                <span className="material-symbols-outlined btn-save-icon">add_location</span>
                                Add Custom Location
                            </button>

                            <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
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
    );
}

export default LocationRate;