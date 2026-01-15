import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { decryptAndSave } from '../lib/crypto'

// Ajout de 'verifying' pour l'état initial
type DownloadStatus = 'verifying' | 'ready' | 'downloading' | 'decrypting' | 'success' | 'error'

interface FileMetadata {
    nonce: string
    filename: string
    download_url: string
    destroy_on_download: boolean
}

interface DownloadState {
    status: DownloadStatus
    error?: string
    filename?: string
}

const API_URL = import.meta.env.VITE_API_URL;

export default function DownloadPage() {
    const { fileId } = useParams<{ fileId: string }>()
    const [key, setKey] = useState<string>('')
    const [state, setState] = useState<DownloadState>({ status: 'verifying' })
    // Le "Cache" : on stocke les données ici dès le montage du composant
    const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null)

    // 1. Extraction de la clé ET Vérification du fichier au montage
    useEffect(() => {
        const hash = window.location.hash.substring(1)
        if (hash) setKey(hash)

        let expirationTimer: ReturnType<typeof setTimeout>

        const verifyAndFetchMetadata = async () => {
            if (!fileId) return;

            try {
                const response = await fetch(`${API_URL}/download/${fileId}`)

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('File not found or expired')
                    }
                    throw new Error('Server unreachable')
                }

                const data = await response.json()
                setFileMetadata(data)
                setState({ status: 'ready', filename: data.filename })

                // L'URL présignée expire après 5 min côté serveur, on avertit à 4 min
                expirationTimer = setTimeout(() => {
                    setState({ status: 'error', error: 'Link expired. Please refresh the page.' })
                    setFileMetadata(null)
                }, 4 * 60 * 1000)

            } catch (error) {
                setState({
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Validation failed'
                })
            }
        }

        verifyAndFetchMetadata()

        // Cleanup du timer si le composant est démonté
        return () => {
            if (expirationTimer) clearTimeout(expirationTimer)
        }
    }, [fileId])

    const handleDownload = async () => {
        // Sécurité : on vérifie qu'on a bien les données en cache et la clé
        if (!fileMetadata || !key || !fileId) {
            setState({ status: 'error', error: 'Missing metadata or decryption key' })
            return
        }

        try {
            setState({ status: 'downloading', filename: fileMetadata.filename })

            // 2. Requête DIRECTE vers S3 (Utilise l'URL en cache, pas d'appel API Lambda ici)
            const encryptedBlob = await fetch(fileMetadata.download_url, { cache: 'no-store' })
                .then(res => {
                    if (!res.ok) throw new Error('Download from storage failed')
                    return res.blob()
                })

            setState({ status: 'decrypting', filename: fileMetadata.filename })

            // 3. Déchiffrement
            await decryptAndSave(encryptedBlob, key, fileMetadata.nonce, fileMetadata.filename)

            // 4. Auto-destruction si l'option était cochée
            if (fileMetadata.destroy_on_download) {
                fetch(`${API_URL}/file/${fileId}`, { method: 'DELETE' })
                    .then(() => console.log("Cleanup triggered"))
                    .catch(err => console.error("Cleanup error:", err));
            }

            setState({ status: 'success', filename: fileMetadata.filename })

        } catch (error) {
            setState({
                status: 'error',
                error: error instanceof Error ? error.message : 'Download failed'
            })
        }
    }

    const isKeyMissing = !key

    // --- RENDER LOGIC ---

    return (
        <div className="app-container">
            <div className="brand">
                <div className="brand-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                    </svg>
                </div>
                <h1 className="brand-title">Secure Drop</h1>
                <p className="brand-subtitle">Secure file retrieval</p>
            </div>

            <div className="upload-card">
                {state.status === 'verifying' ? (
                    <div className="download-info">
                        <div className="spinner"></div>
                        <p>Verifying link integrity...</p>
                    </div>
                ) : state.status === 'success' ? (
                    <div className="download-success">
                        <div className="success-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22,4 12,14.01 9,11.01" />
                            </svg>
                        </div>
                        <h3>File decrypted successfully!</h3>
                        <p className="success-filename">{state.filename}</p>
                        <p className="success-hint">The file has been saved to your downloads.</p>
                        <Link to="/" className="upload-btn" style={{ textDecoration: 'none', marginTop: '1rem' }}>
                            Share a new file
                        </Link>
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
                        <h3>Link Invalid</h3>
                        <p className="error-message">{state.error}</p>
                        <button className="upload-btn" onClick={() => window.location.reload()}>
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
                            <h3>{fileMetadata?.filename}</h3>
                            <p className="file-ready-text">This encrypted file is ready for decryption.</p>

                            {isKeyMissing ? (
                                <div className="key-warning">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    </svg>
                                    <span>Decryption key missing in URL</span>
                                </div>
                            ) : (
                                <div className="key-status">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5" />
                                    </svg>
                                    <span>Key detected & verified</span>
                                </div>
                            )}
                        </div>

                        <button
                            className={`upload-btn ${state.status !== 'ready' ? 'uploading' : ''}`}
                            onClick={handleDownload}
                            disabled={state.status !== 'ready' || isKeyMissing}
                        >
                            {state.status === 'downloading' || state.status === 'decrypting' ? (
                                <>
                                    <div className="spinner"></div>
                                    {state.status === 'downloading' ? 'Fetching from S3...' : 'Decrypting...'}
                                </>
                            ) : (
                                "Download and Decrypt"
                            )}
                        </button>
                    </>
                )}
            </div>

            <div className="footer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Client-side decryption • Zero-Knowledge
            </div>
        </div>
    )
}