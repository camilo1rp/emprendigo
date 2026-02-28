# Emprendigo Backend

FastAPI backend for the Colombian Small Business Booking Platform.

## Project Documentation
- [Manual Testing Guide](manual_testing_guide.md)
- [Guía de Negocio](guia_de_negocio.md)

## Setup (Docker - Recommended)

You can run the entire stack (PostgreSQL + Backend) using Docker Compose. This avoids needing to install PostgreSQL locally or configure Supabase manually for development.

1. **Start the services:**
   ```bash
   docker-compose up -d --build
   ```

2. **Run Migrations:**
   You need to run the migrations inside the backend container to create the database tables.
   ```bash
   docker-compose exec backend alembic upgrade head
   ```
   *Note: If this is the very first time and you haven't generated a migration yet, run:*
   ```bash
   docker-compose exec backend alembic revision --autogenerate -m "Initial migration"
   docker-compose exec backend alembic upgrade head
   ```

3. **Access the API:**
   - API: `http://localhost:8000`
   - Docs: `http://localhost:8000/docs`
   - Database: Accessible on `localhost:5432` (user: `postgres`, pass: `postgres`, db: `emprendigo`)

4. **Stop services:**
   ```bash
   docker-compose down
   ```

## Manual Setup (Alternative)

### 1. Environment Setup

Create a virtual environment to isolate dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

Install the required Python packages:
```bash
pip install -r requirements.txt
```

### 2. Configuration

Create a `.env` file by copying the example:
```bash
cp .env.example .env
```

You need to update the following variables in `.env`:

**DATABASE_URL**
This is your PostgreSQL connection string.
- **If using Supabase:** Go to Project Settings -> Database -> Connection string -> URI. It looks like: `postgresql://postgres.cap...:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
- **Note:** Ensure you use the *Session* mode port (usually 5432) or *Transaction* mode port (6543) correctly. For asyncpg (which we use), Transaction mode (6543) is often recommended with Supabase.
- **Format:** `postgresql+asyncpg://user:password@host:port/dbname`

**SECRET_KEY**
This is used to sign JWT tokens for authentication.
- You can generate a secure key by running this command in your terminal:
  ```bash
  openssl rand -hex 32
  ```
- Copy the output and paste it as the value for `SECRET_KEY`.

### 3. Database Migrations

We use Alembic for database migrations.

**Generate the initial migration:**
(Only do this if `backend/infrastructure/persistence/migrations/versions` is empty)
```bash
alembic revision --autogenerate -m "Initial migration"
```

**Apply migrations:**
This creates the tables in your database.
```bash
alembic upgrade head
```

### 4. Running the Server

Start the development server with hot-reloading:
```bash
uvicorn backend.main:app --reload
```

The API will be available at `http://localhost:8000`.

## API Documentation

Access the Swagger UI at `http://localhost:8000/docs`.

## Testing

1. Install testing dependencies:
   ```bash
   pip install pytest pytest-asyncio httpx
   ```
2. Run tests:
   ```bash
   pytest
   ```

## Deployment

### Environment Variables
Ensure the following are set in your production environment (e.g. Docker, Vercel, Railway):
- `DATABASE_URL`: PostgreSQL connection string.
- `SECRET_KEY`: Strong random string.
- `OPENAI_API_KEY`: For AI Agent.
- `ANTHROPIC_API_KEY` / `GROQ_API_KEY`: Optional for multi-model.

### WhatsApp Webhook
- Configure the webhook in Meta App Dashboard to point to `https://your-domain.com/api/v1/whatsapp/webhook`.
- Verify Token: `emprendigo_verify_token` (or configured value).

### Docker Production
Build and run the container:
```bash
docker build -t emprendigo-backend .
docker run -p 8000:8000 --env-file .env emprendigo-backend
```
