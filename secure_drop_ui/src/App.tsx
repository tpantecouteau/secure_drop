import { useState, useRef, useEffect } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { encrpyptFile } from './lib/crypto'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  title: string
  message: string
  key?: string
}

const API_URL = import.meta.env.VITE_API_URL;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

// Declare Turnstile global type
declare global {
  interface Window {
    turnstile: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback': () => void }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'encrypting' | 'uploading'>('idle')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [expiresIn, setExpiresIn] = useState<number>(24) // hours
  const [destroyOnDownload, setDestroyOnDownload] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  const expirationOptions = [
    { value: 1, label: '1 heure' },
    { value: 24, label: '24 heures' },
    { value: 168, label: '7 jours' },
    { value: 720, label: '30 jours' },
  ]

  useEffect(() => {
    if (!selectedFile || !TURNSTILE_SITE_KEY || !turnstileRef.current) return
    if (turnstileWidgetId.current) return

    const timer = setTimeout(() => {
      if (window.turnstile && turnstileRef.current) {
        turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            setTurnstileToken(token)
          },
          'error-callback': () => {
            setTurnstileToken(null)
          }
        })
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current)
        turnstileWidgetId.current = null
      }
    }
  }, [selectedFile])

  const showToast = (type: Toast['type'], title: string, message: string, key?: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, title, message, key }])

    // Auto-remove after 8 seconds (longer for success with key)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, key ? 15000 : 5000)
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('info', 'Copied!', 'The key has been copied to the clipboard')
    } catch {
      console.error('Failed to copy')
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const handleDropzoneClick = () => {
    fileInputRef.current?.click()
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)

    try {
      // Validate size BEFORE encryption
      if (selectedFile.size > MAX_FILE_SIZE) {
        showToast('error', 'File too large', 'Maximum size is 5 MB')
        return
      }

      // Verify Turnstile token
      if ((!turnstileToken || turnstileToken === '') && TURNSTILE_SITE_KEY) {
        showToast('error', 'Verification required', 'Please complete the security check')
        return
      }

      setUploadPhase('encrypting')
      const { encryptedFile, nonce, key } = await encrpyptFile(selectedFile)

      setUploadPhase('uploading')
      const formData = new FormData()
      formData.append('file', encryptedFile, selectedFile.name)
      formData.append('nonce', nonce)
      formData.append('filename', selectedFile.name)
      formData.append('expires_in_hours', expiresIn.toString())
      formData.append('destroy_on_download', destroyOnDownload.toString())
      if (turnstileToken) {
        formData.append('cf_turnstile_token', turnstileToken)
      }

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        const url = `${window.location.origin}/download/${result.file_id}#${key}`
        showToast(
          'success',
          'File uploaded successfully!',
          `ID: ${result.file_id}`,
          url,

        )
        setSelectedFile(null)
        setExpiresIn(24) // Reset to default
        setDestroyOnDownload(false) // Reset to default
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        const errorText = await response.text()
        showToast(
          'error',
          'Upload failed',
          `Server error: ${response.status} - ${errorText || 'Unknown error'}`
        )
      }
    } catch (error) {
      showToast(
        'error',
        'Connection error',
        error instanceof Error ? error.message : 'Unable to contact the server'
      )
    } finally {
      setIsUploading(false)
      setUploadPhase('idle')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="app-container">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <div className="toast-icon">
              {toast.type === 'success' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
              )}
              {toast.type === 'error' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              {toast.type === 'info' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
              {toast.key && (
                <div className="toast-key">
                  <div className="toast-key-label">Secure sharing link:</div>
                  <div className="toast-key-value">
                    <code>{toast.key.substring(0, 35)}...</code>
                    <button
                      className="toast-copy-btn"
                      onClick={() => copyToClipboard(toast.key!)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Brand Section */}
      <div className="brand">
        <div className="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <h1 className="brand-title">Secure Drop</h1>
        <p className="brand-subtitle">End-to-end encrypted file sharing</p>
      </div>

      {/* Upload Card */}
      <div className="upload-card">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden-input"
        />

        <div
          className={`dropzone ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleDropzoneClick}
        >
          <div className="dropzone-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="dropzone-text">
            <h3>Drop your file here</h3>
            <p>or <span>browse</span> to choose a file</p>
          </div>
        </div>

        {/* File Preview */}
        {selectedFile && (
          <div className="file-preview">
            <div className="file-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
            </div>
            <div className="file-info">
              <div className="file-name">{selectedFile.name}</div>
              <div className="file-size">{formatFileSize(selectedFile.size)}</div>
            </div>
            <button className="file-remove" onClick={handleRemoveFile}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Expiration Selector */}
        {selectedFile && (
          <div className="expiration-selector">
            <div className="expiration-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              <span>Expires in</span>
            </div>
            <div className="expiration-options">
              {expirationOptions.map(option => (
                <button
                  key={option.value}
                  className={`expiration-option ${expiresIn === option.value ? 'active' : ''}`}
                  onClick={() => setExpiresIn(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Destroy on Download Toggle */}
        {selectedFile && (
          <div className="toggle-container">
            <label className="toggle-wrapper">
              <div className="toggle-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 6,6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                <div>
                  <span className="toggle-label">Destroy after download</span>
                  <span className="toggle-hint">The file will be destroyed as soon as it is retrieved</span>
                </div>
              </div>
              <div className={`toggle ${destroyOnDownload ? 'active' : ''}`} onClick={() => setDestroyOnDownload(!destroyOnDownload)}>
                <div className="toggle-knob"></div>
              </div>
            </label>
          </div>
        )}

        {/* Cloudflare Turnstile Widget */}
        {selectedFile && TURNSTILE_SITE_KEY && (
          <div ref={turnstileRef} className="turnstile-container" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}></div>
        )}

        {/* Upload Button */}
        <button
          className={`upload-btn ${isUploading ? 'uploading' : ''}`}
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? (
            <>
              <div className="spinner"></div>
              {uploadPhase === 'encrypting' ? 'Encrypting...' : 'Uploading...'}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Securely
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="footer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Your files are encrypted and secure
      </div>
    </div>
  )
}

export default App
