// ============== ENCRYPTION ==============

export async function encryptFile(file: File) {
    // Generate the 256 bits AES-GCM key
    const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    )

    // Generate a random nonce (12 bytes for AES-GCM)
    const nonce = window.crypto.getRandomValues(new Uint8Array(12))

    // File reading as ArrayBuffer
    const fileArrayBuffer = await file.arrayBuffer()

    // Encrypt the file
    const encryptedArrayBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        fileArrayBuffer,
    )

    // Export the key for the user
    const exportedKey = await window.crypto.subtle.exportKey('raw', key)

    // Return the encrypted file and the key
    return {
        encryptedFile: new Blob([encryptedArrayBuffer], { type: file.type }),
        nonce: btoa(String.fromCharCode(...nonce)),
        key: btoa(String.fromCharCode(...new Uint8Array(exportedKey))),
    }
}

// Keep old function name for backward compatibility
export const encrpyptFile = encryptFile

// ============== DECRYPTION ==============

/**
 * Decode a base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
}

/**
 * Decrypt an encrypted blob using AES-GCM
 * @param encryptedBlob - The encrypted file as a Blob
 * @param base64Key - The encryption key in base64 format
 * @param base64Nonce - The nonce/IV in base64 format
 * @returns The decrypted data as ArrayBuffer
 */
export async function decryptFile(
    encryptedBlob: Blob,
    base64Key: string,
    base64Nonce: string
): Promise<ArrayBuffer> {
    // Decode key and nonce from base64
    const keyBytes = base64ToUint8Array(base64Key)
    const nonce = base64ToUint8Array(base64Nonce)

    // Import the key for decryption
    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBytes.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    )

    // Read the encrypted blob as ArrayBuffer
    const encryptedData = await encryptedBlob.arrayBuffer()

    // Decrypt the data
    const decryptedData = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
        cryptoKey,
        encryptedData
    )

    return decryptedData
}

/**
 * Decrypt and trigger download of a file
 * @param encryptedBlob - The encrypted file
 * @param base64Key - The encryption key in base64
 * @param base64Nonce - The nonce in base64
 * @param filename - Original filename to use for download
 */
export async function decryptAndSave(
    encryptedBlob: Blob,
    base64Key: string,
    base64Nonce: string,
    filename: string = 'fichier_dechiffre'
): Promise<void> {
    // Decrypt the file
    const decryptedData = await decryptFile(encryptedBlob, base64Key, base64Nonce)

    // Create a download link
    const blob = new Blob([decryptedData])
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}