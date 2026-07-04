# LOCAL_RAIL_API_CONTRACT
- version: 1.0
- status: active
- last_updated: 2026-06-27
- owner: NexTeam Studio
- scope: localhost-only seam between NexTeam rail and Clawdia's Bragi

## Purpose

This repo is the canonical rail for:
- WordPress draft / Yoast / media / featured image operations
- CompanyCam photo reads

Clawdia's Bragi should call this local API over loopback instead of duplicating integration code or secrets.

## Bind / start

- Host: `127.0.0.1`
- Default port: `3210`
- Start command:
  - `npm run rail:local-api`

Required env vars by name:
- `RAIL_LOCAL_API_TOKEN`
- `WORDPRESS_BASE_URL`
- `WORDPRESS_USERNAME`
- `WORDPRESS_APP_PASSWORD`
- `COMPANYCAM_API_TOKEN`

Provision `RAIL_LOCAL_API_TOKEN` only through the local gitignored env/secret store used on the machine running the rail. Never place the actual token value in this contract or any committed file.

Optional env vars:
- `RAIL_LOCAL_API_PORT`

The server binds only to `127.0.0.1`, not `0.0.0.0`.

## Auth

Every `/rail/*` route requires:
- Header: `Authorization: Bearer <RAIL_LOCAL_API_TOKEN>`

If the header is missing or wrong:
- HTTP `401`
- Response:

```json
{
  "ok": false,
  "error": {
    "code": "LOCAL_RAIL_UNAUTHORIZED",
    "message": "Missing or invalid local rail token."
  }
}
```

## Error shape

All failures return:

```json
{
  "ok": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable summary"
  }
}
```

Possible extra fields:
- `detail`
- `upstreamStatus`
- `upstreamBody`
- `route`

Example media-upload failure:

```json
{
  "ok": false,
  "error": {
    "code": "WORDPRESS_MEDIA_UPLOAD_FAILED",
    "message": "WordPress media upload failed.",
    "upstreamStatus": 406,
    "upstreamBody": "<html>...</html>",
    "route": "/wp-json/wp/v2/media"
  }
}
```

## Routes

### `GET /rail/health`

Returns service metadata.

Success:

```json
{
  "ok": true,
  "result": {
    "service": "local-rail-api",
    "host": "127.0.0.1",
    "port": 3210,
    "localhostOnly": true
  }
}
```

### `POST /rail/wp/draft`

Creates a draft post through the WordPress rail.

Request:

```json
{
  "title": "Article title",
  "contentHtml": "<h1>...</h1><p>...</p>",
  "categories": [15],
  "tags": [13],
  "slug": "optional-slug",
  "excerpt": "optional excerpt",
  "commentStatus": "closed",
  "pingStatus": "closed"
}
```

Success:

```json
{
  "ok": true,
  "result": {
    "postId": 1234,
    "url": "https://example.com/?p=1234",
    "editUrl": "https://example.com/wp-admin/post.php?post=1234&action=edit",
    "status": "draft",
    "slug": "",
    "title": "Article title",
    "categories": [15],
    "tags": [13],
    "headingSummary": {
      "h1": 1,
      "h2": 3,
      "h3": 2
    }
  }
}
```

### `POST /rail/wp/yoast`

Writes the core REST-writable Yoast fields and, when local editor credentials are available, also writes Yoast social overrides through the editor seam.

Request:

```json
{
  "postId": 1234,
  "focusKeyword": "pool leak detection",
  "seoTitle": "SEO title here",
  "metaDescription": "Meta description here",
  "socialTitle": "Optional social title",
  "socialDescription": "Optional social description",
  "socialImageUrl": "Optional absolute image URL",
  "twitterTitle": "Optional Twitter title override",
  "twitterDescription": "Optional Twitter description override",
  "twitterImageUrl": "Optional Twitter image URL override"
}
```

Success:

```json
{
  "ok": true,
  "result": {
    "postId": 1234,
    "stored": {
      "focusKeyword": "pool leak detection",
      "seoTitle": "SEO title here",
      "metaDescription": "Meta description here"
    },
    "yoastHeadJson": {
      "title": "SEO title here",
      "description": "Meta description here"
    }
  }
}
```

### `POST /rail/wp/upload-media`

Uploads one image through the WordPress media endpoint.

File format:
- JSON body with `contentBase64`
- plain base64 is recommended
- `data:` URLs are also accepted and stripped automatically

Request:

```json
{
  "filename": "my-image.png",
  "mimeType": "image/png",
  "contentBase64": "iVBORw0K...",
  "title": "Optional title",
  "altText": "Optional alt text",
  "caption": "Optional caption",
  "description": "Optional description"
}
```

Success:

```json
{
  "ok": true,
  "result": {
    "mediaId": 5678,
    "url": "https://example.com/wp-content/uploads/2026/06/my-image.png",
    "filename": "my-image.png",
    "mimeType": "image/png",
    "title": "Optional title",
    "altText": "Optional alt text",
    "caption": "Optional caption",
    "description": "Optional description"
  }
}
```

### `POST /rail/wp/featured-image`

Sets `featured_media` and verifies it with a cache-busted authenticated read.

Request:

```json
{
  "postId": 1234,
  "mediaId": 5678
}
```

Success:

```json
{
  "ok": true,
  "result": {
    "postId": 1234,
    "featuredMediaId": 5678,
    "verifiedWithCacheBust": true
  }
}
```

### `GET /rail/companycam/photos`

Reads across CompanyCam photos.

Query params:
- `perPage`
- `query`
- `modifiedSince`

Success:

```json
{
  "ok": true,
  "result": {
    "count": 2,
    "photos": [
      {
        "id": "3307564303",
        "project_id": "107515958",
        "company_id": "732048",
        "creator_id": "2750320",
        "creator_name": "Chris Sears",
        "creator_type": "User",
        "status": "active",
        "processing_status": "processed",
        "internal": false,
        "captured_at": 1782236589,
        "created_at": 1782237634,
        "updated_at": 1782237635,
        "description": null,
        "coordinates": {
          "lat": 30.43838,
          "lon": -84.29198
        },
        "photo_url": "https://app.companycam.com/assets/Image/3307564303",
        "uris": []
      }
    ]
  }
}
```

### `GET /rail/companycam/photo/:id`

Reads one CompanyCam photo by ID.

Success:

```json
{
  "ok": true,
  "result": {
    "photo": {
      "id": "3307564303",
      "project_id": "107515958",
      "photo_url": "https://app.companycam.com/assets/Image/3307564303",
      "uris": []
    }
  }
}
```

## Current orchestration recommendation

Keep the routes atomic and let Bragi orchestrate:
1. `POST /rail/wp/draft`
2. `POST /rail/wp/upload-media` when a featured image is chosen
3. `POST /rail/wp/featured-image`
4. `POST /rail/wp/yoast`
5. `GET /rail/companycam/photos` and `GET /rail/companycam/photo/:id` for read-only photo selection support

This keeps the rail simple and keeps article-writing / selection logic in Bragi rather than inside the transport layer.
