import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Activity, MailCheck, Building2, Pill, MapPin } from 'lucide-react';
import { PORTALS } from '../config/portals';
import { api } from '../api/client';

export default function PortalSelector({ onSelect }) {
  const [stats, setStats] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);

  useEffect(() => {
    api.auth.portalStats()
      .then((res) => setStats(res))
      .catch(() => setStats(null));
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F7F4EE',
      backgroundImage: `
        radial-gradient(circle at 12% 14%, rgba(217, 93, 57, 0.09) 0%, transparent 42%),
        radial-gradient(circle at 88% 82%, rgba(13, 148, 104, 0.08) 0%, transparent 44%),
        radial-gradient(circle at 75% 15%, rgba(194, 120, 3, 0.07) 0%, transparent 38%),
        linear-gradient(to right, rgba(28, 25, 23, 0.035) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(28, 25, 23, 0.035) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 100% 100%, 100% 100%, 48px 48px, 48px 48px',
      color: '#181614',
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '28px clamp(20px, 5vw, 64px) 36px',
    }}>
      {/* Top Editorial Bar */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        paddingBottom: 20,
        borderBottom: '1px solid #E5DFD5',
        maxWidth: 1220,
        width: '100%',
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: '#141210',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#E06D44',
          }}>
            <Activity size={21} strokeWidth={2.3} />
          </div>
          <div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#141210',
            }}>
              MediPulse<span style={{ color: '#D95D39' }}>.ai</span>
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#78716C',
            }}>
              Predictive Medicine Intelligence
            </div>
          </div>
        </div>

        {/* Live Dynamic System Telemetry */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {stats && (
            <>
              <span style={pillStyle}>
                <Building2 size={13} color="#D95D39" />
                <b>{stats.pharmacies_count}</b> Pharmacies
              </span>
              <span style={pillStyle}>
                <Pill size={13} color="#0D9468" />
                <b>{stats.medicines_count}</b> Medicines
              </span>
              <span style={pillStyle}>
                <MapPin size={13} color="#C27803" />
                <b>{stats.cities_count}</b> Cities
              </span>
            </>
          )}
          <span style={{
            ...pillStyle,
            background: '#141210',
            color: '#FAF8F5',
            borderColor: '#141210',
          }}>
            <MailCheck size={13} color="#34D399" />
            <span>{stats?.smtp_live ? 'Gmail OTP Live' : 'Email Verification Ready'}</span>
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: 1220,
        width: '100%',
        margin: '42px auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {/* Editorial Hero */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          alignItems: 'end',
          gap: 24,
          marginBottom: 42,
        }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#D95D39',
              marginBottom: 12,
            }}>
              MULTI-PORTAL ACCESS GATEWAY
            </div>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(32px, 4.6vw, 54px)',
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              margin: 0,
              color: '#141210',
            }}>
              Choose your{' '}
              <span style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontStyle: 'italic',
                fontWeight: 400,
                color: '#D95D39',
                fontSize: '1.08em',
              }}>
                dedicated
              </span>{' '}
              workspace.
            </h1>
          </div>

          <p style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.65,
            color: '#57534E',
            maxWidth: 460,
            justifySelf: 'start',
          }}>
            Every role operates in an isolated portal with real-time 6-digit email verification,
            scoped data permissions, and tailored clinical &amp; warehouse workflows.
          </p>
        </div>

        {/* 4 Bespoke Asymmetric Portal Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}>
          {PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isHovered = hoveredKey === portal.key;
            return (
              <button
                key={portal.role}
                type="button"
                onClick={() => onSelect(portal)}
                onMouseEnter={() => setHoveredKey(portal.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  position: 'relative',
                  background: isHovered ? '#FFFFFF' : '#FCFBF8',
                  border: `1.5px solid ${isHovered ? portal.accent : '#E4DDD2'}`,
                  borderRadius: 20,
                  padding: '26px 24px 22px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
                  transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: isHovered
                    ? `0 22px 44px -14px rgba(20, 18, 16, 0.14), 0 0 0 1px ${portal.accent}22`
                    : '0 2px 10px rgba(20, 18, 16, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 300,
                  overflow: 'hidden',
                }}
              >
                {/* Top color signature strip */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: portal.accent,
                  opacity: isHovered ? 1 : 0.72,
                  transition: 'opacity 0.2s',
                }} />

                <div>
                  {/* Header row: badge + icon */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 22,
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: portal.accent,
                      background: portal.accentSoft,
                      padding: '5px 10px',
                      borderRadius: 999,
                    }}>
                      {portal.badge}
                    </span>

                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      background: portal.panelBg,
                      color: portal.isLightPanel ? portal.accent : portal.panelText,
                      border: `1px solid ${portal.panelBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.24s ease',
                      transform: isHovered ? 'scale(1.07) rotate(-3deg)' : 'scale(1)',
                    }}>
                      <Icon size={21} />
                    </div>
                  </div>

                  {/* Title & description */}
                  <h2 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: '-0.025em',
                    color: '#141210',
                    margin: '0 0 8px',
                  }}>
                    {portal.label}
                  </h2>

                  <p style={{
                    fontSize: 13.5,
                    lineHeight: 1.58,
                    color: '#57534E',
                    margin: '0 0 18px',
                  }}>
                    {portal.description}
                  </p>

                  {/* Feature highlights */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
                    {portal.highlights.map((h) => (
                      <div key={h} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: '#44403C',
                        fontWeight: 500,
                      }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: portal.accent,
                          flexShrink: 0,
                        }} />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer bar */}
                <div style={{
                  paddingTop: 14,
                  borderTop: '1px solid #ECE7DF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <code style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11.5,
                    color: '#78716C',
                  }}>
                    {portal.path}
                  </code>

                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 700,
                    color: isHovered ? portal.accent : '#141210',
                    transition: 'color 0.2s',
                  }}>
                    Enter
                    <ArrowUpRight
                      size={16}
                      style={{
                        transform: isHovered ? 'translate(2px, -2px)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        maxWidth: 1220,
        width: '100%',
        margin: '0 auto',
        paddingTop: 18,
        borderTop: '1px solid #E5DFD5',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 12,
        color: '#78716C',
      }}>
        <span>MediPulse AI v2.0 · Star &amp; Snowflake Data Warehouse + Predictive Mining</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          OTP Email Verification · Role-Isolated JWT · RBAC Active
        </span>
      </footer>
    </div>
  );
}

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 999,
  background: '#FCFBF8',
  border: '1px solid #E4DDD2',
  fontSize: 12,
  color: '#44403C',
  fontWeight: 500,
};
