import boto3
import os

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME')

def handler(event, context):
    for record in event['Records']:
        # On ne s'intéresse qu'aux suppressions (REMOVE)
        if record['eventName'] == 'REMOVE':
            # On récupère l'ID du fichier qui vient d'être supprimé de DynamoDB
            file_id = record['dynamodb']['OldImage']['file_id']['S']
            
            try:
                print(f"Tentative de suppression de S3 : {file_id}")
                s3.delete_object(Bucket=BUCKET_NAME, Key=file_id)
                print(f"Fichier {file_id} supprimé avec succès de S3.")
            except Exception as e:
                print(f"Erreur lors de la suppression de {file_id} : {str(e)}")
    
    return {"status": "processed"}