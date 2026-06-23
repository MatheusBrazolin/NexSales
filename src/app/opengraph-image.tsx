import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'NexSales — Smart Sales Platform'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid pattern background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Glow top-left */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '-80px',
            width: '500px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Glow bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            right: '-60px',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px 80px',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Logo + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                fontWeight: 700,
                color: 'white',
              }}
            >
              N
            </div>
            <span
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-0.5px',
              }}
            >
              NexSales
            </span>
          </div>

          {/* Main headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '4px',
                  background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                  borderRadius: '2px',
                }}
              />
              <span style={{ fontSize: '16px', color: '#94a3b8', fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase' }}>
                PDV inteligente
              </span>
            </div>

            <h1
              style={{
                fontSize: '72px',
                fontWeight: 800,
                color: 'white',
                lineHeight: 1.05,
                letterSpacing: '-2px',
                margin: 0,
              }}
            >
              Gestão de vendas{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #3b82f6, #818cf8)',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                moderna
              </span>
            </h1>

            <p
              style={{
                fontSize: '22px',
                color: '#94a3b8',
                margin: 0,
                lineHeight: 1.5,
                maxWidth: '700px',
              }}
            >
              Controle clientes, vendas e performance do seu negócio em tempo real.
            </p>
          </div>

          {/* Bottom pills */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {['PDV', 'Clientes', 'Relatórios', 'Offline'].map((label) => (
              <div
                key={label}
                style={{
                  padding: '8px 20px',
                  borderRadius: '999px',
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  color: '#93c5fd',
                  fontSize: '15px',
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
