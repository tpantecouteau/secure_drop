# 🔐 SecureDrop

A secure, end-to-end encrypted file sharing application. Files are encrypted client-side before upload, ensuring zero-knowledge architecture — the server never sees your encryption keys.

![Security](https://img.shields.io/badge/encryption-AES--256--GCM-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- **🔒 End-to-End Encryption** — AES-256-GCM encryption happens in your browser
- **🚫 Zero-Knowledge** — Encryption key never touches the server (stored in URL fragment)
- **⏱️ Auto-Expiration** — Files auto-delete after 1 hour to 30 days
- **💥 Destroy on Download** — Optional one-time download links
- **🤖 Bot Protection** — Cloudflare Turnstile integration
- **📱 QR Code Sharing** — Scan to share on mobile
- **🖼️ Image Preview** — Thumbnail preview for image files
- **📊 Upload Progress** — Visual feedback during encryption/upload
- **ℹ️ About Page** — How it works, security details

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React + Vite  │────▶│  FastAPI + AWS  │────▶│   S3 + DynamoDB │
│   (Vercel)      │     │  Lambda         │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                                │
        └──── Encryption Key (URL #fragment) ────────────┘
                    Never sent to server
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- AWS CLI configured
- Terraform

### Local Development

**Backend:**
```bash
cd secure_drop_api
pip install -r requirements.txt
# Create .env file (see .env.example)
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd secure_drop_ui
npm install
# Create .env file (see .env.example)
npm run dev
```

### Environment Variables

**Backend (`secure_drop_api/.env`):**
```
BUCKET_NAME=your-s3-bucket-name
REGION=eu-west-3
TABLE_NAME=SecureDropMetadata
ENV=development
TURNSTILE_SECRET=1x0000000000000000000000000000000AA  # Test key
```

**Frontend (`secure_drop_ui/.env`):**
```
VITE_API_URL=http://localhost:8000
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA  # Test key
```

## 📦 Deployment

### Infrastructure (Terraform)

```bash
cd infra
terraform init
terraform apply -var="turnstile_secret=YOUR_REAL_SECRET_KEY"
```

### Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set environment variables:
   - `VITE_API_URL` = Lambda Function URL
   - `VITE_TURNSTILE_SITE_KEY` = Cloudflare Site Key
3. Deploy

### Backend (AWS Lambda)

```bash
./deploy.sh  # Builds and packages Lambda
cd infra && terraform apply
```

## 🔒 Security

| Layer | Protection |
|-------|-----------|
| Encryption | AES-256-GCM (client-side) |
| Key Storage | URL fragment (never sent to server) |
| Rate Limiting | 10 requests/hour/IP |
| Bot Protection | Cloudflare Turnstile |
| Input Validation | UUID, nonce, expiration bounds |
| CORS | Restricted origins |
| IAM | Least privilege permissions |

## 🛠️ Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- Web Crypto API

**Backend:**
- FastAPI + Python
- AWS Lambda (Mangum)
- Boto3

**Infrastructure:**
- AWS S3 (file storage)
- AWS DynamoDB (metadata + TTL)
- Terraform

## 📁 Project Structure

```
secure_drop/
├── secure_drop_ui/       # React frontend
│   ├── src/
│   │   ├── App.tsx       # Main upload component
│   │   ├── pages/        # Download page
│   │   └── lib/crypto.ts # Encryption logic
│   └── .env.example
├── secure_drop_api/      # FastAPI backend
│   ├── app/
│   │   ├── main.py       # API endpoints
│   │   └── cleanup.py    # TTL cleanup Lambda
│   └── .env.example
├── infra/                # Terraform
│   └── main.tf
└── deploy.sh             # Lambda packaging script
```

## 📄 License

MIT License — See [LICENSE](LICENSE)

## 🤝 Contributing

Contributions welcome! Please open an issue first.
