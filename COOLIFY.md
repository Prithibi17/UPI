# Deploying YouPI-PG on Coolify

YouPI-PG can be deployed on [Coolify](https://coolify.io) in less than 2 minutes.

---

## Recommended Deployment: Docker Compose (Easiest & Most Robust)

Because YouPI-PG is a multi-service gateway that shares persistent SQLite data across its supervisor, payment API, checkout portal, and merchant admin, **Docker Compose** is the recommended build pack in Coolify.

### Step 1: Create Application in Coolify
1. In your Coolify dashboard, click **+ Add Resource** -> **Public Repository** (or **Private Repository**).
2. Enter your repository URL: `https://github.com/Prithibi17/UPI`
3. Branch: `main`

### Step 2: Configure Build Pack
1. In the application settings screen under **General**:
2. Find the **Build Pack** dropdown (which defaults to *Nixpacks*).
3. Switch **Build Pack** to: **Docker Compose**
4. Under **Docker Compose Location**, keep `/docker-compose.yml`.

### Step 3: Configure Domains / Routing in Coolify
In the **Domains** field of your Coolify resource, you can map your public domain directly:
- **Port 7000**: Customer Checkout Portal (e.g. `https://pay.yourdomain.com`)
- **Port 6001**: Merchant Admin Dashboard (e.g. `https://admin.yourdomain.com`)
- **Port 6100**: Payment REST API (e.g. `https://api.yourdomain.com`)
- **Port 8090**: Control Center & Process Supervisor

### Step 4: Click Deploy
Click **Deploy**! Coolify will build the container, mount persistent storage for SQLite (`/app/data`), and start all services.

---

## Alternative: Deploy via Dockerfile
If you prefer deploying a single container without compose:
1. In Coolify, switch **Build Pack** to **Dockerfile**.
2. **Dockerfile Path**: `/Dockerfile`
3. **Exposed Port**: `7000` (or `6001` or `8090`).
4. Under **Storage**, add a persistent volume mount:
   - Destination Path: `/app/data`
5. Click **Deploy**.

---

## Alternative: Deploy via Nixpacks
If you keep **Nixpacks**:
1. Coolify will detect the repository's root `nixpacks.toml`.
2. Set **Base Directory**: `/`
3. Under **Storage**, add a persistent volume mount for `/app/data`.
4. Click **Deploy**.
