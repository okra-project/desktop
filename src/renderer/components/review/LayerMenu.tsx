import React from 'react';

export interface LayerDefinition {
  id: string;
  displayName: string;
  icon: string;
  color: {
    hex: string;
    border: string;
    fill: string;
  };
  category?: 'entity' | 'ocr';
}

interface LayerOptionProps {
  layer: LayerDefinition;
  active: boolean;
  onClick: () => void;
}

function LayerOption({ layer, active, onClick }: LayerOptionProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '6px 12px',
        textAlign: 'left',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#334155',
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = 'transparent')
      }
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: `2px solid ${active ? layer.color.border : '#cbd5e1'}`,
          backgroundColor: active ? layer.color.hex : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {active && (
          <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>
            ✓
          </span>
        )}
      </div>
      <span>{layer.displayName}</span>
    </button>
  );
}

export interface LayerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleLayers: Set<string>;
  onToggleLayer: (layer: string) => void;
  onToggleLayers?: (layers: string[], visible: boolean) => void;
  layers: LayerDefinition[];
}

const PLUGIN_LABELS: Record<string, string> = {
  'google-docai': 'Google DocAI',
  openrouter: 'OpenRouter',
};

function getPluginFromLayerId(id: string): string {
  const colonIdx = id.indexOf(':');
  return colonIdx > 0 ? id.slice(0, colonIdx) : 'other';
}

export function LayerMenu({
  open,
  onOpenChange,
  visibleLayers,
  onToggleLayer,
  onToggleLayers,
  layers,
}: LayerMenuProps) {
  const activeCount = visibleLayers.size;

  const layersByPlugin = layers.reduce(
    (acc, layer) => {
      const plugin = getPluginFromLayerId(layer.id);
      if (!acc[plugin]) acc[plugin] = [];
      acc[plugin].push(layer);
      return acc;
    },
    {} as Record<string, LayerDefinition[]>,
  );
  const pluginIds = Object.keys(layersByPlugin);

  const handleGroupToggle = (pluginId: string) => {
    const pluginLayers = layersByPlugin[pluginId];
    const layerIds = pluginLayers.map((l) => l.id);
    const allActive = layerIds.every((id) => visibleLayers.has(id));

    if (onToggleLayers) {
      onToggleLayers(layerIds, !allActive);
    } else {
      layerIds.forEach((id) => {
        const isActive = visibleLayers.has(id);
        if (allActive ? isActive : !isActive) {
          onToggleLayer(id);
        }
      });
    }
  };

  const getPluginActiveState = (pluginId: string) => {
    const pluginLayers = layersByPlugin[pluginId];
    const activeInPlugin = pluginLayers.filter((l) =>
      visibleLayers.has(l.id),
    ).length;
    if (activeInPlugin === 0) return 'none';
    if (activeInPlugin === pluginLayers.length) return 'all';
    return 'partial';
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => onOpenChange(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          border: '1px solid #e2e8f0',
          backgroundColor: '#fff',
          color: '#475569',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = '#f8fafc')
        }
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        title="Toggle overlay layers"
      >
        <span style={{ fontSize: '14px' }}>⧉</span>
        <span>Layers</span>
        <span
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '9999px',
            backgroundColor: activeCount > 0 ? '#dbeafe' : '#f1f5f9',
            color: activeCount > 0 ? '#2563eb' : '#64748b',
            fontWeight: 600,
          }}
        >
          {activeCount}
        </span>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => onOpenChange(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow:
                '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              padding: '4px 0',
              zIndex: 9999,
              minWidth: '180px',
            }}
          >
            {pluginIds.map((pluginId, idx) => (
              <React.Fragment key={pluginId}>
                {idx > 0 && (
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: '#f1f5f9',
                      margin: '4px 0',
                    }}
                  />
                )}
                <button
                  onClick={() => handleGroupToggle(pluginId)}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#f8fafc')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '3px',
                      border: `2px solid ${getPluginActiveState(pluginId) !== 'none' ? '#3b82f6' : '#cbd5e1'}`,
                      backgroundColor:
                        getPluginActiveState(pluginId) === 'all'
                          ? '#3b82f6'
                          : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getPluginActiveState(pluginId) === 'all' && (
                      <span
                        style={{
                          color: '#fff',
                          fontSize: '9px',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓
                      </span>
                    )}
                    {getPluginActiveState(pluginId) === 'partial' && (
                      <span
                        style={{
                          color: '#3b82f6',
                          fontSize: '9px',
                          fontWeight: 'bold',
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>
                  {PLUGIN_LABELS[pluginId] || pluginId}
                </button>
                {layersByPlugin[pluginId].map((layer) => (
                  <LayerOption
                    key={layer.id}
                    layer={layer}
                    active={visibleLayers.has(layer.id)}
                    onClick={() => onToggleLayer(layer.id)}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default LayerMenu;
