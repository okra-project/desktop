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
      <span style={{ color: layer.color.hex, fontSize: '14px' }}>
        {layer.icon}
      </span>
      <span>{layer.displayName}</span>
    </button>
  );
}

export interface LayerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleLayers: Set<string>;
  onToggleLayer: (layer: string) => void;
  layers: LayerDefinition[];
}

export function LayerMenu({
  open,
  onOpenChange,
  visibleLayers,
  onToggleLayer,
  layers,
}: LayerMenuProps) {
  const activeCount = visibleLayers.size;

  const entityLayers = layers.filter(
    (l) => l.category === 'entity' || !l.category,
  );
  const ocrLayers = layers.filter((l) => l.category === 'ocr');

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
              minWidth: '150px',
            }}
          >
            {entityLayers.map((layer) => (
              <LayerOption
                key={layer.id}
                layer={layer}
                active={visibleLayers.has(layer.id)}
                onClick={() => onToggleLayer(layer.id)}
              />
            ))}
            {ocrLayers.length > 0 && entityLayers.length > 0 && (
              <div
                style={{
                  height: '1px',
                  backgroundColor: '#f1f5f9',
                  margin: '4px 0',
                }}
              />
            )}
            {ocrLayers.map((layer) => (
              <LayerOption
                key={layer.id}
                layer={layer}
                active={visibleLayers.has(layer.id)}
                onClick={() => onToggleLayer(layer.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default LayerMenu;
