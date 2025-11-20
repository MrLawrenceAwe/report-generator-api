# Explorer Web Frontend

A modern React application for the Explorer Copilot, built with Vite.

## Running Locally

1. **Start the Backend**:
   Ensure the FastAPI service is running (usually on port 8000):
   ```bash
   # From the project root
   uvicorn backend.api.app:app --reload --port 8000
   ```

2. **Start the Frontend**:
   ```bash
   cd frontends/web
   npm install  # If you haven't already
   npm run dev
   ```

3. **Visit the App**:
   Open `http://localhost:5173` in your browser.

   *Note: If your API runs on a different host/port, you can override the API base by appending `?apiBase=http://your-api-url` to the URL. This setting is cached in `localStorage`.*

