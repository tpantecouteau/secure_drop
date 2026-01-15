import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { decryptAndSave } from '../lib/crypto'

type DownloadStatus = 'ready' | 'downloading' | 'decrypting' | 'success' | 'error'

interface DownloadState {
    status: DownloadStatus
    error?: string
    filename?: string
}

const API_URL = import.meta.env.VITE_API_URL;


export default function DownloadPage() {
    const { fileId } = useParams<{ fileId: string }>()
    const [key, setKey] = useState<string>('')
    const [state, setState] = useState<DownloadState>({ status: 'ready' })

    // Extract key from URL fragment on mount
    useEffect(() => {
        const hash = window.location.hash.substring(1) // Remove the #
        if (hash) {
            setKey(hash)
        }
    }, [])

    const handleDownload = async () => {
        if (!fileId) {
            setState({ status: 'error', error: 'missing file id' })
            return
        }
        if (!key) {
            setState({ status: 'error', error: 'missing key' })
            return
        }

        try {
            setState({ status: 'downloading' })

            // 1. Fetch encrypted file from API
            const response = await fetch(`${API_URL}/download/${fileId}`)

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('File not found or expired')
                }
                throw new Error(`Server error: ${response.status}`)
            }

            const data = await response.json()
            const nonce = data.nonce
            const filename = data.filename
            const download_url = data.download_url
            const destroy_after = data.destroy_on_download

            if (!nonce) {
                throw new Error('Nonce missing in server response')
            }

            const encryptedBlob = await fetch(download_url, { cache: 'no-store' }).then(res => res.blob())

            setState({ status: 'decrypting', filename })

            // 2. Decrypt and download
            await decryptAndSave(encryptedBlob, key, nonce, filename)

            if (destroy_after) {
                fetch(`${API_URL}/file/${fileId}`, { method: 'DELETE' })
                    .then(() => console.log("Auto-destruction demandée"))
                    .catch(err => console.error("Erreur destruction:", err));
            }

            setState({ status: 'success', filename })

        } catch (error) {
            setState({
                status: 'error',
                error: error instanceof Error ? error.message : 'unknown error'
            })
        }
    }

    const isKeyMissing = !key

    return (
        <div className="app-container">
            {/* Brand Section */}
            <div className="brand">
                <div className="brand-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                    </svg>
                </div>
                <h1 className="brand-title">Secure Drop</h1>
                <p className="brand-subtitle">Secure file retrieval</p>
            </div>

            {/* Download Card */}
            <div className="upload-card">
                {state.status === 'success' ? (
                    <div className="download-success">
                        <div className="success-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22,4 12,14.01 9,11.01" />
                            </svg>
                        </div>
                        <h3>File decrypted successfully!</h3>
                        <p className="success-filename">{state.filename}</p>
                        <p className="success-hint">The file has been downloaded to your device.</p>
                    </div>
                ) : state.status === 'error' ? (
                    <div className="download-error">
                        <div className="error-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>
                        <h3>Error</h3>
                        <p className="error-message">{state.error}</p>
                        <button className="upload-btn" onClick={() => setState({ status: 'ready' })}>
                            Retry
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="download-info">
                            <div className="info-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7,10 12,15 17,10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </div>
                            <h3>File ready to be retrieved</h3>
                            <div className="file-id-display">
                                <span className="label">ID :</span>
                                <code>{fileId}</code>
                            </div>
                            {isKeyMissing && (
                                <div className="key-warning">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <span>The decryption key is missing in the link</span>
                                </div>
                            )}
                            {!isKeyMissing && (
                                <div className="key-status">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                                    </svg>
                                    <span>Decryption key detected</span>
                                </div>
                            )}
                        </div>

                        <button
                            className={`upload-btn ${state.status !== 'ready' ? 'uploading' : ''}`}
                            onClick={handleDownload}
                            disabled={state.status !== 'ready' || isKeyMissing}
                        >
                            {state.status === 'downloading' ? (
                                <>
                                    <div className="spinner"></div>
                                    Downloading...
                                </>
                            ) : state.status === 'decrypting' ? (
                                <>
                                    <div className="spinner"></div>
                                    Decrypting...
                                </>
                            ) : (
                                <>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7,10 12,15 17,10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Download and decrypt
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="footer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Client-side decryption • Zero-Knowledge
            </div>
        </div>
    )
}
