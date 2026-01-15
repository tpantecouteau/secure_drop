import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

def decrypt_file(encrypted_file_path, base64_key, base64_nonce, output_path):
    try:
        # 1. Décoder la clé et le nonce depuis le Base64
        key = base64.b64decode(base64_key)
        nonce = base64.b64decode(base64_nonce)

        # 2. Lire le fichier chiffré
        with open(encrypted_file_path, 'rb') as f:
            ciphertext_with_tag = f.read()

        # 3. Initialiser AES-GCM avec la clé
        aesgcm = AESGCM(key)

        # 4. Déchiffrer
        # Note : AES-GCM en Python s'attend à ce que le tag soit inclus 
        # à la fin du ciphertext, ce que Web Crypto API fait par défaut.
        decrypted_data = aesgcm.decrypt(nonce, ciphertext_with_tag, None)

        # 5. Sauvegarder le résultat
        with open(output_path, 'wb') as f:
            f.write(decrypted_data)
        
        print(f"✅ Déchiffrement réussi ! Fichier enregistré sous : {output_path}")
        print(f"Contenu : {decrypted_data.decode('utf-8', errors='ignore')[:100]}...")

    except Exception as e:
        print(f"❌ Échec du déchiffrement : {e}")

# --- CONFIGURATION DU TEST ---
# Copie-colle ici les valeurs que tu as obtenues dans ton UI React
KEY_B64 = "ljS4BdNFjfAP6xVEQRxFA608ORGHkibwo6yWRBiO/q4=" 
NONCE_B64 = "+5tt3i0XUSZL+obs"
FILE_PATH = "local_storage/cf9207a7-2ffe-4c6c-afe7-bc75ced92b5d" # Le fichier .enc généré par FastAPI

decrypt_file(FILE_PATH, KEY_B64, NONCE_B64, "test_resultat_clair.txt")