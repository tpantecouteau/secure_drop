from mangum import Mangum
import boto3
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import io
import uuid
import time
import os
import re
import logging
import sys

# --- LOGGING CONFIGURATION ---
root_logger = logging.getLogger()
if root_logger.handlers:
    for handler in root_logger.handlers:
        root_logger.removeHandler(handler)

# On définit un handler qui écrit sur la sortie standard
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[handler]
)

logger = logging.getLogger("securedrop")
logger.setLevel(logging.INFO)
# On s'assure que les logs remontent au root logger
logger.propagate = True

app = FastAPI(title="SecureDrop API")

# --- CORS MIDDLEWARE (handles all responses including errors) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://securedropui.vercel.app",
        "http://localhost:5173"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION AWS ---
BUCKET_NAME = os.environ.get("BUCKET_NAME")
REGION = os.environ.get("REGION", "eu-west-3")
TABLE_NAME = os.environ.get("TABLE_NAME", "SecureDropMetadata")

s3_client = boto3.client('s3', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

# --- REQUEST LOGGING MIDDLEWARE ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Log incoming request
    logger.info(f"➡️  {request.method} {request.url.path}")
    
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        
        # Log response
        status_emoji = "✅" if response.status_code < 400 else "❌"
        logger.info(f"{status_emoji} {request.method} {request.url.path} | {response.status_code} | {process_time:.2f}ms")
        
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(f"❌ {request.method} {request.url.path} | ERROR | {process_time:.2f}ms | {str(e)}")
        raise

RATELIMIT_TABLE = dynamodb.Table("SecureDropRateLimit")
LIMIT_PER_HOUR = 10

async def check_rate_limit(ip_address: str):
    now = int(time.time())
    
    res = RATELIMIT_TABLE.get_item(Key={"ip_address": ip_address})
    item = res.get('Item')

    if item:
        if item['count'] >= LIMIT_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
        
        RATELIMIT_TABLE.update_item(
            Key={"ip_address": ip_address},
            UpdateExpression="ADD #c :val",
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={":val": 1}
        )
    else:
        RATELIMIT_TABLE.put_item(Item={
            "ip_address": ip_address,
            "count": 1,
            "expires_at": now + 3600
        })

@app.post('/upload')
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    nonce: str = Form(...),
    filename: str = Form(...),
    expires_in_hours: int = Form(24),
    destroy_on_download: str = Form("false")
) -> dict:
    try:
        client_ip = request.client.host 
        await check_rate_limit(client_ip)

        file_id = str(uuid.uuid4())
        file_content = await file.read()
        file_size = len(file_content)
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large")
        # Calculate expiration timestamp (Unix epoch)
        expires_at = int(time.time()) + (expires_in_hours * 3600)
        destroy_flag = destroy_on_download == "true"
        
        logger.info(f"📤 UPLOAD | id={file_id} | size={file_size} bytes | expires_in={expires_in_hours}h | destroy={destroy_flag}")
        
        table.put_item(Item={
            'file_id': file_id,
            'nonce': nonce,
            'filename': os.path.basename(filename),  # Sanitize filename  
            'content_type': file.content_type,
            'expires_at': expires_at,
            'destroy_on_download': destroy_flag
        })
        
        background_tasks.add_task(
            s3_client.put_object,
            Bucket=BUCKET_NAME,
            Key=file_id,
            Body=file_content,
            ContentType='application/octet-stream'
        )
        
        logger.info(f"✅ UPLOAD SUCCESS | id={file_id}")
        
        return {
            "file_id": file_id,
            "nonce": nonce
        }

    except HTTPException:
        raise  # Re-raise 413, 429 etc. as-is
    except Exception as e:
        logger.error(f"❌ UPLOAD FAILED | error={str(e)}")
        raise HTTPException(status_code=500, detail="Upload failed")
        
@app.get("/download/{file_id}")
async def download_file(file_id: str, background_tasks: BackgroundTasks):
    try:
        # Validate UUID format to prevent injection
        uuid_regex = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
        if not uuid_regex.match(file_id):
            raise HTTPException(status_code=400, detail="Invalid file ID format")
        
        logger.info(f"📥 DOWNLOAD REQUEST | id={file_id}")
        
        response = table.get_item(Key={"file_id": file_id})
        if 'Item' not in response:
            raise HTTPException(status_code=404, detail="File not found")
            
        item = response['Item']
        nonce = item['nonce']
        filename = item.get('filename', 'file.enc')
        destroy_after = item.get('destroy_on_download', False)

        # GÉNÉRATION DE L'URL PRÉSIGNÉE S3 (Valable 5 minutes)
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': file_id},
            ExpiresIn=300  # 300 secondes = 5 minutes
        )

        logger.info(f"🔗 PRESIGNED URL GENERATED | id={file_id}")
        
        return {
            "download_url": presigned_url,
            "nonce": nonce,
            "filename": filename,
            "destroy_on_download": destroy_after
        }

    except HTTPException:
        raise  # Re-raise 400, 404 etc. as-is
    except Exception as e:
        logger.error(f"❌ DOWNLOAD FAILED | id={file_id} | error={str(e)}")
        raise HTTPException(status_code=500, detail="Could not generate download link")

@app.delete("/file/{file_id}")
async def delete_file(file_id: str):
    try:
        # Validate UUID format to prevent injection
        uuid_regex = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
        if not uuid_regex.match(file_id):
            raise HTTPException(status_code=400, detail="Invalid file ID format")
        
        logger.info(f"🗑️  MANUAL DELETION REQUEST | id={file_id}")
        
        # 1. Vérifier si l'option destroy_on_download était activée pour ce fichier
        response = table.get_item(Key={"file_id": file_id})
        if 'Item' not in response:
            return {"message": "Already deleted or not found"}
            
        item = response['Item']
        
        # 2. On ne supprime que si l'utilisateur avait coché l'option
        if item.get('destroy_on_download', False):
            # Supprimer de S3
            s3_client.delete_object(Bucket=BUCKET_NAME, Key=file_id)
            # Supprimer de DynamoDB
            table.delete_item(Key={"file_id": file_id})
            logger.info(f"✅ DESTROY ON DOWNLOAD SUCCESS | id={file_id}")
            return {"status": "deleted"}
        
        return {"status": "kept", "reason": "destroy_on_download was false"}

    except HTTPException:
        raise  # Re-raise 400 etc. as-is
    except Exception as e:
        logger.error(f"❌ DELETION FAILED | id={file_id} | error={str(e)}")
        raise HTTPException(status_code=500, detail="Could not delete file")

@app.get("/health")
async def health_check():
    return {"status": "online"}

@app.get("/")
async def root():
    logger.info("🏠 ROOT accessed")
    return {"message": "SecureDrop API is online", "docs": "/docs"}



handler = Mangum(app)