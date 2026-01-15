from mangum import Mangum
import boto3
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
import io
import uuid
import time
import os
import logging

# --- LOGGING CONFIGURATION ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("securedrop")

app = FastAPI(title="SecureDrop API")

# --- CONFIGURATION AWS ---
BUCKET_NAME = os.environ.get("BUCKET_NAME")
REGION = os.environ.get("REGION")
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

@app.post('/upload')
async def upload_file(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    nonce: str = Form(...),
    filename: str = Form(...),
    expires_in_hours: int = Form(24),
    destroy_on_download: str = Form("false")
) -> dict:
    try:
        file_id = str(uuid.uuid4())
        file_content = await file.read()
        file_size = len(file_content)
        
        # Calculate expiration timestamp (Unix epoch)
        expires_at = int(time.time()) + (expires_in_hours * 3600)
        destroy_flag = destroy_on_download == "true"
        
        logger.info(f"📤 UPLOAD | id={file_id} | size={file_size} bytes | expires_in={expires_in_hours}h | destroy={destroy_flag}")
        
        table.put_item(Item={
            'file_id': file_id,
            'nonce': nonce,
            'filename': filename,  
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
    except Exception as e:
        logger.error(f"❌ UPLOAD FAILED | error={str(e)}")
        raise HTTPException(status_code=500, detail="Upload failed")
        
@app.get("/download/{file_id}")
async def download_file(file_id: str, background_tasks: BackgroundTasks):
    try:
        logger.info(f"📥 DOWNLOAD REQUEST | id={file_id}")
        
        response = table.get_item(Key={"file_id": file_id})
        if 'Item' not in response:
            logger.warning(f"⚠️  FILE NOT FOUND | id={file_id}")
            raise HTTPException(status_code=404, detail="File not found")
            
        item = response['Item']
        nonce = item['nonce']
        filename = item.get('filename', 'file.enc')
        destroy_after = item.get('destroy_on_download', False)
        
        s3_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=file_id)
        file_content = s3_obj['Body'].read()
        file_size = len(file_content)
        
        logger.info(f"📥 DOWNLOAD | id={file_id} | size={file_size} bytes | destroy_after={destroy_after}")
        
        # If destroy_on_download is enabled, schedule deletion after response
        if destroy_after:
            background_tasks.add_task(s3_client.delete_object, Bucket=BUCKET_NAME, Key=file_id)
            background_tasks.add_task(table.delete_item, Key={"file_id": file_id})
            logger.info(f"🗑️  SCHEDULED DELETION | id={file_id}")
        
        return StreamingResponse(
            io.BytesIO(file_content),
            media_type="application/octet-stream",
            headers={
                "x-nonce": nonce,
                "x-filename": filename,
                "Access-Control-Expose-Headers": "x-nonce, x-filename"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ DOWNLOAD FAILED | id={file_id} | error={str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "online"}

@app.get("/")
async def root():
    logger.info("🏠 ROOT accessed")
    return {"message": "SecureDrop API is online", "docs": "/docs"}

handler = Mangum(app)