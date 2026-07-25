import { useState } from 'react';

const DEFAULT_LOCATIONS = [
    { id: 'home', name: 'Home', rate: 0.38, voltage: 240, icon: 'home', maxAmps: 32 },
    { id: 'office', name: 'Office', rate: 0.45, voltage: 240, icon: 'business', maxAmps: 32 },
    { id: 'supercharger', name: 'Supercharger', rate: 1.20, voltage: 480, icon: 'bolt', maxAmps: 500 },
    { id: 'public_ac', name: 'Public AC', rate: 0.60, voltage: 240, icon: 'location_on', maxAmps: 32 },
];

function LocationRate({ selectedLocation, onLocationChange, onCloseModal }) {
    const [showModal, setShowModal] = useState(false);
    const [locations] = useState(DEFAULT_LOCATIONS);
    const [isDetecting, setIsDetecting] = useState(false);
    const [currentId, setCurrentId] = useState(
        selectedLocation?.id || 'home'
    );
    const [customRate, setCustomRate] = useState(
        selectedLocation?.rate?.toString() || '0.38'
    );

    const currentLocation = locations.find(l => l.id === currentId) || locations[0];

    const handleDetectLocation = () => {
        if (!navigator.geolocation) return;

        setIsDetecting(true);
        navigator.geolocation.getCurrentPosition(
            () => {
                setIsDetecting(false);
            },
            () => {
                setIsDetecting(false);
            },
            { timeout: 10000 }
        );
    };

    const handleSelect = (id) => {
        setCurrentId(id);
        const loc = locations.find(l => l.id === id);
        if (loc) {
            setCustomRate(loc.rate.toString());
        }
    };

    const handleConfirm = () => {
        const base = locations.find(l => l.id === currentId);
        if (base) {
            const selected = {
                ...base,
                rate: parseFloat(customRate) || base.rate,
            };
            onLocationChange(selected);
        }
        setShowModal(false);
        if (onCloseModal) onCloseModal();
    };

    const handleOpen = () => {
        setCurrentId(selectedLocation?.id || 'home');
        setCustomRate(selectedLocation?.rate?.toString() || '0.38');
        setShowModal(true);
    };

    // Modal
    if (showModal) {
        return (
            <div className="modal-overlay" onClick={() => setShowModal(false)}>
                <div className="modal-sheet" onClick={e => e.stopPropagation()}>
                    <div className="modal-handle"></div>
                    <div className="modal-title">Select Location</div>

                    <button
                        className="geo-btn"
                        onClick={handleDetectLocation}
                        disabled={isDetecting}
                    >
                        <span className="material-symbols-outlined geo-btn-icon">my_location</span>
                        {isDetecting ? 'Detecting...' : 'Detect My Location'}
                    </button>

                    {locations.map(loc => (
                        <button
                            key={loc.id}
                            className={`modal-option ${currentId === loc.id ? 'selected' : ''}`}
                            onClick={() => handleSelect(loc.id)}
                        >
                            <span className="material-symbols-outlined modal-option-icon">{loc.icon}</span>
                            <div className="modal-option-info">
                                <div className="modal-option-label">{loc.name}</div>
                                <div className="modal-option-sub">
                                    RM {loc.rate.toFixed(2)}/kWh &middot; {loc.voltage}V &middot; Max {loc.maxAmps}A
                                </div>
                            </div>
                            {currentId === loc.id && <span className="tag tag-blue">Active</span>}
                        </button>
                    ))}

                    <div className="form-group mt-4">
                        <label className="form-label">Custom Rate (RM/kWh)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="5"
                            className="form-control-custom"
                            value={customRate}
                            onChange={e => setCustomRate(e.target.value)}
                        />
                    </div>

                    <button className="btn-primary-custom mt-3" onClick={handleConfirm}>
                        <span className="material-symbols-outlined">check</span>
                        Apply Location
                    </button>

                    <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="location-display" onClick={handleOpen}>
            <div className="location-icon-box">
                <span className="material-symbols-outlined loc-icon-symbol">{currentLocation.icon}</span>
            </div>
            <div className="location-info">
                <div className="location-name">{currentLocation.name}</div>
                <div className="location-rate">
                    RM {(selectedLocation?.rate || currentLocation.rate).toFixed(2)} / kWh &middot;{' '}
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