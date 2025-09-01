#!/bin/bash

echo "🚀 Setting up Ref SDK API development environment..."

# Set up claude code
npm install -g @anthropic-ai/claude-code

# Install PostgreSQL
echo "Updating package lists..."
sudo apt update
echo "Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
echo "Starting PostgreSQL..."
sudo service postgresql start

# Wait for PostgreSQL to be ready
sleep 3

# Setup PostgreSQL database and user (using sudo su - postgres to avoid password prompts)
echo "Setting up PostgreSQL user and database..."
sudo su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
sudo su - postgres -c "createdb ref_sdk_db" || echo "Database already exists"

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    # Update DATABASE_URL in .env
    sed -i 's|DATABASE_URL=.*|DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ref_sdk_db?schema=public"|' .env
fi

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run migrations
echo "Running database migrations..."
npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --name init

echo "✅ Setup complete! You can now run 'npm run dev' to start the server."