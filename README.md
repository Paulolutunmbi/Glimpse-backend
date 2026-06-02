# Glimpse Backend

Glimpse Backend is an Express and MongoDB API that powers authentication, posts, comments, discovery, profile management, settings, and realtime updates for the Glimpse frontend.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB with Mongoose |
| Auth | JSON Web Tokens, bcryptjs |
| Realtime | Socket.IO |
| Uploads | Multer + Cloudinary |
| Utilities | dotenv, cors |

## Features

- Account registration, login, direct password reset, and JWT session validation.
- JWT session validation with active-session tracking.
- Post CRUD, likes, views, shares, and feed retrieval.
- Public post hydration for shareable deep links.
- Comment CRUD with realtime socket events.
- User profile, follow, save, and settings APIs.
- Discovery endpoint for trending content and suggested creators.
- Cloudinary-backed media uploads for avatars, covers, and post media.
- Centralized JSON error handling and 404 handling.

## Folder Structure

| Path | Purpose |
| --- | --- |
| `src/server.js` | Entry point that starts the server, database, and Socket.IO |
| `src/app.js` | Express app setup (CORS, JSON parsing, routes, error handling) |
| `src/config/` | Runtime configuration helpers (DB + CORS) |
| `src/routes/` | API route registration (mounts existing route modules) |
| `src/sockets/` | Socket.IO initialization and event wiring |
| `server.js` | Legacy entrypoint proxy (loads `src/server.js`) |
| `index.js` | Legacy entrypoint proxy (loads `src/server.js`) |
| `routes/` | HTTP route definitions |
| `controllers/` | Request handlers and domain logic |
| `models/` | Mongoose schemas for users, posts, and comments |
| `middleware/` | Auth, rate limiting, upload handling, and error handling |
| `services/` | Media upload and deletion services |
| `config/` | External service configuration such as Cloudinary |
| `utils/` | Shared helpers |

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in `Backend/` with the environment variables listed below.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port for the backend server, defaults to `5000` |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWTs |
| `JWT_EXPIRES_IN` | No | JWT lifetime, defaults to `7d` |
| `CLIENT_ORIGINS` | No | Comma-separated list of allowed frontend origins for CORS |
| `CLIENT_APP_URL` | No | Canonical frontend URL used for CORS |
| `CLIENT_ORIGIN` | No | Fallback frontend URL used for CORS |
| `CLIENT_POST_ROUTE_PREFIX` | No | Frontend route prefix for post deep links, defaults to `/post` |
| `CLOUDINARY_CLOUD_NAME` | Yes for uploads | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes for uploads | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes for uploads | Cloudinary API secret |

## Run Server Locally

Start the development server with nodemon:

```bash
npm run dev
```

Start the server without file watching:

```bash
npm start
```

The app listens on `http://localhost:5000` by default unless `PORT` is set.

## Database Setup

1. Start a MongoDB instance locally or use a hosted MongoDB Atlas cluster.
2. Set `MONGO_URI` to the connection string.
3. Run the server once to let Mongoose connect.
4. Start the server once to let Mongoose connect.

## API Documentation

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check that returns `{ status: "ok" }` |

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a verified account |
| `POST` | `/api/auth/signup` | Alias for register |
| `POST` | `/api/auth/login` | Authenticate a user and return a JWT session token |
| `GET` | `/api/auth/me` | Return the current authenticated user |
| `POST` | `/api/auth/forgot-password` | Reset a password after validating username and account email |

### Posts

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/posts` | Return public posts ordered by newest first |
| `GET` | `/api/posts/:id` | Return a single post for deep-link hydration when visible to the viewer |
| `GET` | `/api/posts/feed` | Return a paginated feed (`latest`, `following`, `personalized`, `trending`, `explore`) |
| `POST` | `/api/posts` | Create a post with optional media upload |
| `PUT` | `/api/posts/:id/like` | Toggle like state for a post |
| `POST` | `/api/posts/:id/view` | Track a post view |
| `POST` | `/api/posts/:id/share` | Track a share action |
| `DELETE` | `/api/posts/:id` | Delete a post |

### Comments

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/comments/:postId` | List comments for a post |
| `POST` | `/api/comments` | Create a comment |
| `PUT` | `/api/comments/:id` | Update a comment owned by the current user |
| `DELETE` | `/api/comments/:id` | Delete a comment owned by the current user |

### User And Profile

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/user/me` | Return the current user profile payload |
| `GET` | `/api/user/profile/:id` | Return another user profile payload |
| `GET` | `/api/user/profile/:id/stats` | Return profile statistics |
| `PATCH` | `/api/user/update` | Update username, bio, extra info, preferences, and profile flags |
| `PUT` | `/api/user/profile` | Alias for profile update |
| `POST` | `/api/user/follow/:id` | Follow a user |
| `POST` | `/api/user/unfollow/:id` | Unfollow a user |
| `POST` | `/api/user/saved/:id` | Save a post |
| `DELETE` | `/api/user/saved/:id` | Remove a saved post |
| `GET` | `/api/user/saved` | Return saved posts |
| `POST` | `/api/user/upload-avatar` | Upload a profile image |
| `POST` | `/api/user/upload-profile-picture` | Alias for avatar upload |
| `POST` | `/api/user/upload-cover-image` | Upload a cover image |
| `POST` | `/api/user/preferences` | Update user preferences |
### Settings

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/user/settings` | Fetch user settings |
| `PATCH` | `/api/user/settings` | Update privacy, notifications, appearance, and security settings |
| `PATCH` | `/api/user/settings/privacy` | Partial privacy update |
| `PATCH` | `/api/user/settings/notifications` | Partial notification update |
| `PATCH` | `/api/user/settings/appearance` | Partial appearance update |
| `POST` | `/api/user/settings/logout-others` | Sign out of all other sessions |
| `POST` | `/api/user/settings/block` | Block a user |
| `POST` | `/api/user/settings/unblock` | Unblock a user |
| `POST` | `/api/user/settings/mute` | Mute a user |
| `POST` | `/api/user/settings/unmute` | Unmute a user |

### Discovery

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/discovery` | Return trending hashtags, categories, recommended moments, and suggested creators |

## Error Handling And Middleware

- `middleware/auth.js` requires a `Bearer` token, verifies the JWT, and rejects inactive sessions.
- `middleware/rateLimiter.js` applies in-memory rate limiting for sensitive auth endpoints.
- `middleware/upload.js` validates upload size and file type for avatar, cover, and post media uploads.
- `middleware/errorHandler.js` returns JSON errors in the shape `{ success: false, message }` and handles unknown routes with a 404 response.
- Most controllers return structured JSON with `success` and `message` fields; auth failures return `401` and validation failures return `400` or `409` as appropriate.

## Deployment Notes

- Set `MONGO_URI`, `JWT_SECRET`, and all production Cloudinary values before starting the service.
- On Render, set `NODE_ENV=production`, `CLIENT_APP_URL=https://glimpse-theta-swart.vercel.app`, and `CLIENT_ORIGINS=https://glimpse-theta-swart.vercel.app`.
- Configure Vercel with `VITE_API_URL=https://glimpse-backend-tin1.onrender.com`.
- The server uses an in-memory rate limiter and feed cache, so a multi-instance deployment should be placed behind sticky sessions or an external cache if you need consistent throttling and cache behavior.
