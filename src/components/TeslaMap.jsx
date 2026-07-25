import { useEffect, useRef } from 'react';
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

function TeslaMap({ latitude, longitude }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (mapInstance.current || !latitude || !longitude) return;

        const map = L.map(mapRef.current, {
            center: [latitude, longitude],
            zoom: 15,
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            touchZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
        });

        L.tileLayer(DARK_TILE_URL, {
            attribution: DARK_ATTR,
            maxZoom: 19,
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);
        L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(DARK_ATTR).addTo(map);

        const marker = L.marker([latitude, longitude], { draggable: false }).addTo(map);
        markerRef.current = marker;

        mapInstance.current = map;

        setTimeout(() => map.invalidateSize(), 300);

        return () => {
            map.remove();
            mapInstance.current = null;
            markerRef.current = null;
        };
    }, [latitude, longitude]);

    // Update marker position when coordinates change
    useEffect(() => {
        if (!mapInstance.current || !latitude || !longitude) return;

        const map = mapInstance.current;
        const pos = [latitude, longitude];

        if (markerRef.current) {
            markerRef.current.setLatLng(pos);
        } else {
            const marker = L.marker(pos, { draggable: false }).addTo(map);
            markerRef.current = marker;
        }

        map.setView(pos, 15);
    }, [latitude, longitude]);

    if (!latitude || !longitude) {
        return (
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">map</span>
                    Tesla Location
                </div>
                <div className="tesla-map-empty">
                    <span className="material-symbols-outlined">location_off</span>
                    <span>No location data. Pull from Tesla first.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="card-custom">
            <div className="card-custom-title">
                <span className="material-symbols-outlined card-title-icon">map</span>
                Tesla Location
            </div>
            <div className="tesla-map-coords">
                <span className="material-symbols-outlined tesla-map-pin">location_on</span>
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </div>
            <div ref={mapRef} className="tesla-map-container"></div>
        </div>
    );
}

export default TeslaMap;