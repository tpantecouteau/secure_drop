import { Link } from 'react-router-dom'

function AboutPage() {
    return (
        <div className="app-container-about">
            {/* Header */}
            <div className="brand">
                <Link to="/" className="brand-link">
                    <div className="brand-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <polyline points="9,12 12,15 16,10" />
                        </svg>
                    </div>
                    <h1>SecureDrop</h1>
                </Link>
                <p className="brand-tagline">End-to-end encrypted file sharing</p>
            </div>

            {/* How It Works Section */}
            <div className="info-section">
                <h2 className="info-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    How It Works
                </h2>

                <div className="info-steps">
                    <div className="info-step">
                        <div className="step-number">1</div>
                        <div className="step-content">
                            <h3>Select Your File</h3>
                            <p>Drag & drop or browse to select any file up to 5MB</p>
                        </div>
                    </div>

                    <div className="info-step">
                        <div className="step-number">2</div>
                        <div className="step-content">
                            <h3>Client-Side Encryption</h3>
                            <p>Your file is encrypted with AES-256-GCM directly in your browser using the Web Crypto API</p>
                        </div>
                    </div>

                    <div className="info-step">
                        <div className="step-number">3</div>
                        <div className="step-content">
                            <h3>Secure Upload</h3>
                            <p>Only the encrypted data is sent to our servers — we never see your encryption key</p>
                        </div>
                    </div>

                    <div className="info-step">
                        <div className="step-number">4</div>
                        <div className="step-content">
                            <h3>Share the Link</h3>
                            <p>The decryption key is stored in the URL fragment (#) — this part is never sent to any server</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Why SecureDrop Section */}
            <div className="info-section">
                <h2 className="info-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Why SecureDrop?
                </h2>

                <div className="info-cards">
                    <div className="info-card">
                        <div className="card-icon">🔐</div>
                        <h3>Zero-Knowledge</h3>
                        <p>Unlike WeTransfer or Dropbox, we can't read your files. The encryption key never leaves your device.</p>
                    </div>

                    <div className="info-card">
                        <div className="card-icon">💥</div>
                        <h3>Self-Destructing</h3>
                        <p>Set files to auto-delete after download or after a custom time period (1 hour to 30 days).</p>
                    </div>

                    <div className="info-card">
                        <div className="card-icon">🌐</div>
                        <h3>Open Source</h3>
                        <p>100% transparent. Audit our code on GitHub.</p>
                    </div>

                    <div className="info-card">
                        <div className="card-icon">🚀</div>
                        <h3>No Account Required</h3>
                        <p>Just upload and share. No sign-up, no tracking, no cookies.</p>
                    </div>
                </div>
            </div>

            {/* Security Section */}
            <div className="info-section">
                <h2 className="info-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Security
                </h2>

                <div className="security-list">
                    <div className="security-item">
                        <span className="security-check">✓</span>
                        <span><strong>AES-256-GCM</strong> — Military-grade encryption</span>
                    </div>
                    <div className="security-item">
                        <span className="security-check">✓</span>
                        <span><strong>Client-side only</strong> — Encryption happens in your browser</span>
                    </div>
                    <div className="security-item">
                        <span className="security-check">✓</span>
                        <span><strong>URL fragment</strong> — Key never sent to server (after #)</span>
                    </div>
                    <div className="security-item">
                        <span className="security-check">✓</span>
                        <span><strong>Auto-expiration</strong> — Files deleted automatically</span>
                    </div>
                    <div className="security-item">
                        <span className="security-check">✓</span>
                        <span><strong>Rate limiting</strong> — Protection against abuse</span>
                    </div>
                </div>
            </div>

            {/* Call to Action */}
            <Link to="/" className="upload-btn" style={{ marginTop: '2rem', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Start Sharing Securely
            </Link>

            {/* Footer */}
            <div className="footer">
                <div className="footer-links">
                    <a href="https://github.com/tpantecouteau/secure_drop" target="_blank" rel="noopener noreferrer">
                        GitHub
                    </a>
                    <span className="footer-divider">•</span>
                    <span>Made with ❤️ for privacy</span>
                </div>
            </div>
        </div>
    )
}

export default AboutPage
