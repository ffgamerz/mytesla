import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLocations, saveLocation, updateLocation, deleteLocation } from '../../supabase/client';

function LocationRate({ selectedLocation, onLocationChange }) {
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
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);

    // Load all locations from database
    const loadLocations = async () => {
        if (!user) return;
        try {
            const locs = await getLocations(user.id);
            setDbLocations(locs);

            // Auto-select first location if none selected
            if (initialLoad && locs.length > 0 && !selectedLocation) {
                onLocationChange({
                    db_id: locs[0].id,
                    name: locs[0].name,
                    rate: locs[0].rate,
                    voltage: locs[0].voltage,
                    maxAmps: locs[0].max_amps,
                    icon: locs[0].icon || 'home',
                });
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

    const handleSelect = (loc) => {
        onLocationChange({
            db_id: loc.id,
            name: loc.name,
            rate: loc.rate,
            voltage: loc.voltage,
            maxAmps: loc.max_amps,
            icon: loc.icon || 'home',
        });
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
            };

            if (editId) {
                // Update existing
                await updateLocation(editId, locationData);
            } else {
                // Insert new
                await saveLocation(user.id, locationData);
            }

            // Refresh list
            await loadLocations();

            // Auto-select if it was the edited one or newly created
            if (editId && selectedLocation?.db_id === editId) {
                onLocationChange({
                    db_id: editId,
                    ...locationData,
                });
            }

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

            // If deleted location was selected, select the first available
            if (selectedLocation?.db_id === locId) {
                const remaining = dbLocations.filter(l => l.id !== locId);
                if (remaining.length > 0) {
                    handleSelect(remaining[0]);
                }
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
        setIsEditing(true);
    };

    const startNew = () => {
        setEditId(null);
        setEditName('');
        setEditRate('0.38');
        setEditVoltage('240');
        setEditMaxAmps('32');
        setEditIcon('location_on');
        setIsEditing(true);
    };

    const handleOpen = () => {
        setIsEditing(false);
        setEditId(null);
        setShowModal(true);
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

                            {dbLocations.length === 0 ? (
                                <div className="history-empty">
                                    <span className="material-symbols-outlined empty-icon">location_off</span>
                                    <p>No locations yet.</p>
                                    <p className="text-muted">Add your first charging location!</p>
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

                            <button className="btn-save mt-3" onClick={startNew}>
                                <span className="material-symbols-outlined btn-save-icon">add_location</span>
                                Add New Location
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