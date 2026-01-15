# 1. Nettoyage
rm -rf build
mkdir build

# 2. Installation des dépendances dans le dossier build
# Note: On utilise --platform manylinux2014_x86_64 pour la compatibilité Lambda
pip install \
    --platform manylinux2014_x86_64 \
    --target=build \
    --implementation cp \
    --python-version 3.11 \
    --only-binary=:all: \
    fastapi mangum cryptography boto3 python-multipart httpx

# 3. Copier ton code
cp secure_drop_api/app/main.py build/

# 4. Créer le zip
cd build
zip -r lambda.zip .
cd ..