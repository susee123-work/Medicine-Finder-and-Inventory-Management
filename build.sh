#!/usr/bin/env bash
# Exit on any error
set -o errexit

echo "==============================================="
echo "  MediPulse AI: Production Build on Render     "
echo "==============================================="

echo "--> Upgrading pip..."
pip install --upgrade pip

echo "--> Installing Python dependencies..."
pip install -r requirements.txt

echo "--> Installing frontend dependencies..."
cd frontend
npm install

echo "--> Building production Vite bundle..."
npm run build
cd ..

echo "--> Build successfully completed!"
