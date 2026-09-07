const TABS = [
    { id: 'calculator', icon: 'bolt', label: 'Calculator' },
    { id: 'mileage', icon: 'speed', label: 'Mileage' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
];

/**
 * Shared bottom navigation for all pages (Calculator / Mileage / Settings).
 * Sign out lives inside each page (existing per-page buttons), nav is tabs only.
 */
function BottomNav({ active, onNavigate }) {
    return (
        <nav className="bottom-tabs">
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    className={`bottom-tab ${active === tab.id ? 'active' : ''}`}
                    onClick={() => onNavigate(tab.id)}
                >
                    <span className="material-symbols-outlined bottom-tab-icon">{tab.icon}</span>
                    <span className="bottom-tab-label">{tab.label}</span>
                </button>
            ))}
        </nav>
    );
}

export default BottomNav;
