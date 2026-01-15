# 1. On dit à Terraform qu'on travaille avec AWS
provider "aws" {
  region = "eu-west-3"
}

# 2. Création du Bucket S3 (Stockage des fichiers)
resource "aws_s3_bucket" "secure_storage" {
  # Le nom du bucket doit être UNIQUE au monde
  bucket = "securedrop-storage-votre-pseudo-2026" 
}

# On bloque tout accès public (Sécurité maximale)
resource "aws_s3_bucket_public_access_block" "security" {
  bucket = aws_s3_bucket.secure_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "s3_cors" {
  bucket = aws_s3_bucket.secure_storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"] # Ou l'URL de ton site Vercel pour plus de sécurité
    max_age_seconds = 3000
  }
}

# 3. Création de la table DynamoDB (Métadonnées)
resource "aws_dynamodb_table" "file_metadata" {
  name           = "SecureDropMetadata"
  billing_mode   = "PAY_PER_REQUEST" # Tu ne payes qu'à l'utilisation
  hash_key       = "file_id"

  attribute {
    name = "file_id"
    type = "S" # S pour String
  }

  # Optionnel : Auto-destruction après X temps
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  stream_enabled   = true
  stream_view_type = "OLD_IMAGE"
}

# 1. Le rôle IAM (L'identité de ton API)
resource "aws_iam_role" "lambda_role" {
  name = "securedrop_lambda_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# 2. Les permissions spécifiques (Seulement S3 et DynamoDB)
resource "aws_iam_role_policy" "lambda_policy" {
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Effect = "Allow"
        Resource = "${aws_s3_bucket.secure_storage.arn}/*"
      },
      {
        Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem"]
        Effect = "Allow"
        Resource = aws_dynamodb_table.file_metadata.arn
      },
      {
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams"
        ]
        Effect   = "Allow"
        # Très important : on ajoute /stream/* à la fin de l'ARN de la table
        Resource = "${aws_dynamodb_table.file_metadata.arn}/stream/*"
      }
    ]
  })
}

resource "aws_lambda_function" "api_lambda" {
  # path.module est le dossier 'infra'. On remonte d'un cran pour trouver lambda.zip
  filename      = "${path.module}/../lambda.zip" 
  function_name = "securedrop-api"
  handler       = "main.handler" # 'main' pour le fichier main.py, 'handler' pour l'objet Mangum
  runtime       = "python3.11"
  role          = aws_iam_role.lambda_role.arn

  # Optionnel : Forcer Terraform à redéployer si le zip change
  source_code_hash = filebase64sha256("${path.module}/../lambda.zip")
}

# 4. L'URL publique pour ton API
resource "aws_lambda_function_url" "api_url" {
  function_name      = aws_lambda_function.api_lambda.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false # Obligatoire quand on utilise "*"
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"] # Plus simple pour le test
    expose_headers    = ["x-nonce", "x-filename"]
    max_age           = 3600
  }
}

# 2. La Lambda de nettoyage
resource "aws_lambda_function" "cleanup_lambda" {
  filename      = "${path.module}/../cleanup_function.zip" # Tu devras ziper cleanup.py
  function_name = "securedrop-cleanup"
  role          = aws_iam_role.lambda_role.arn # On peut réutiliser le même rôle s'il a les droits S3
  handler       = "cleanup.handler"
  runtime       = "python3.11"
  
  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.secure_storage.id
    }
  }
}

# 3. Le lien entre DynamoDB et la Lambda (Le Trigger)
resource "aws_lambda_event_source_mapping" "cleanup_trigger" {
  event_source_arn  = aws_dynamodb_table.file_metadata.stream_arn
  function_name     = aws_lambda_function.cleanup_lambda.arn
  starting_position = "LATEST"
}

# 4. Permission pour la Lambda de lire le flux (à ajouter à ton iam_role_policy)
# Ajoute "dynamodb:DescribeStream", "dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:ListStreams"

output "api_endpoint" {
  value = aws_lambda_function_url.api_url.function_url
}