import boto3
import os
import json

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

def handler(event, context):
    print(f"DEBUG: Reçu un événement avec {len(event['Records'])} records")
    
    for record in event['Records']:
        event_name = record['eventName']
        # On vérifie si c'est une suppression
        if event_name == 'REMOVE':
            # On vérifie si c'est une suppression due au TTL ou manuelle
            # Si 'userIdentity' contient 'dynamodb.amazonaws.com', c'est le TTL !
            is_ttl = record.get('userIdentity', {}).get('type') == 'Service'
            
            old_image = record['dynamodb'].get('OldImage', {})
            file_id = old_image.get('file_id', {}).get('S')
            
            print(f"🔥 ACTION: Suppression détectée | ID: {file_id} | Origine: {'TTL' if is_ttl else 'Manuelle'}")
            
            if file_id:
                try:
                    s3.delete_object(Bucket=BUCKET_NAME, Key=file_id)
                    print(f"✅ S3 SUCCESS: {file_id} supprimé")
                except Exception as e:
                    print(f"❌ S3 ERROR: Impossible de supprimer {file_id} - {str(e)}")
        else:
            print(f"ℹ️  SKIP: Événement {event_name} ignoré (seules les suppressions comptent)")

    return {"status": "ok"}