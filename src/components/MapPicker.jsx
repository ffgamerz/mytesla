import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

// Fix Leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function MapPicker({ latitude, longitude, onLocationChange }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerRef = useRef(null);
    const [isLocating, setIsLocating] = useState(false);

    const center = (latitude && longitude) ? [latitude, longitude] : [3.139, 101.6869]; // Default: KL
    const zoom = (latitude && longitude) ? 16 : 12;

    useEffect(() => {
        if (mapInstance.current) return; // Already initialized

        const map = L.map(mapRef.current, {
            center,
            zoom,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer(DARK_TILE_URL, {
            attribution: DARK_ATTR,
            maxZoom: 19,
        }).addTo(map);

        // Add zoom control to top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Add attribution
        L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(DARK_ATTR).addTo(map);

        // Add marker if location exists
        if (latitude && longitude) {
            const marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
            markerRef.current = marker;

            marker.on('dragend', function () {
                const pos = this.getLatLng();
                if (onLocationChange) {
                    onLocationChange(pos.lat, pos.lng);
                }
            });
        }

        // Click on map to move marker
        map.on('click', function (e) {
            const pos = e.latlng;

            if (markerRef.current) {
                markerRef.current.setLatLng(pos);
            } else {
                const marker = L.marker([pos.lat, pos.lng], { draggable: true }).addTo(map);
                markerRef.current = marker;
                marker.on('dragend', function () {
                    const p = this.getLatLng();
                    if (onLocationChange) onLocationChange(p.lat, p.lng);
                });
            }

            if (onLocationChange) {
                onLocationChange(pos.lat, pos.lng);
            }
        });

        mapInstance.current = map;

        // Fix map rendering after transition
        setTimeout(() => map.invalidateSize(), 300);

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

    // Update marker when latitude/longitude props change
    useEffect(() => {
        if (!mapInstance.current || !latitude || !longitude) return;

        const map = mapInstance.current;
        const pos = [latitude, longitude];

        if (markerRef.current) {
            markerRef.current.setLatLng(pos);
        } else {
            const marker = L.marker(pos, { draggable: true }).addTo(map);
            markerRef.current = marker;
            marker.on('dragend', function () {
                const p = this.getLatLng();
                if (onLocationChange) onLocationChange(p.lat, p.lng);
            });
        }

        map.setView(pos, 16);
    }, [latitude, longitude]);

    const handleLocateMe = () => {
        if (!navigator.geolocation) return;
        setIsLocating(true);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                if (onLocationChange) {
                    onLocationChange(lat, lng);
                }

                if (mapInstance.current) {
                    mapInstance.current.setView([lat, lng], 16);
                }

                setIsLocating(false);
            },
            () => {
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    return (
        <div className="map-picker">
            <div className="map-picker-header">
                <button
                    className="map-locate-btn"
                    onClick={handleLocateMe}
                    disabled={isLocating}
                >
                    <span className="material-symbols-outlined">
                        {isLocating ? 'radar' : 'my_location'}
                    </span>
                    {isLocating ? 'Detecting...' : 'My Current Location'}
                </button>
                {latitude && longitude && (
                    <span className="map-coords">
                        {latitude.toFixed(4)}, {longitude.toFixed(4)}
                    </span>
                )}
            </div>
            <div ref={mapRef} className="map-container"></div>
            <p className="map-hint">
                <span className="material-symbols-outlined">touch_app</span>
                Click on the map or drag the marker to set location
            </p>
        </div>
    );
}

export default MapPicker;