# PDF to CBZ Converter

Convert PDF files to CBZ format for comic book readers. Modern web application with real-time preview and auto-optimization.

## Quick Start

```bash
docker pull r45635/pdf-to-cbz
docker run -p 3000:3000 r45635/pdf-to-cbz
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- **Live Preview** - Real-time page preview with adjustable parameters
- **Auto-Optimization** - Automatic parameter tuning for optimal file size
- **Direct Extraction** - Extract embedded images directly from PDF
- **Side-by-side Comparison** - Compare original vs converted
- **Two Conversion Modes:**
  - **Convert**: Render pages at chosen DPI
  - **Direct Extract**: Extract images as-is from PDF

## Tags

- `latest` - Latest stable release
- `v2.2.3` - Current version with Docker canvas fix

## Docker Compose

```yaml
services:
  pdf-to-cbz:
    image: r45635/pdf-to-cbz:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

```bash
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Application port |
| `HOSTNAME` | `0.0.0.0` | Bind address |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/analyze` | Analyze PDF structure |
| `POST /api/preview` | Generate page preview |
| `POST /api/convert` | Convert PDF to CBZ |
| `POST /api/extract` | Direct image extraction |
| `GET /api/health` | Health check |

## Source Code

GitHub: [https://github.com/r45635/pdf-to-cbz-converter](https://github.com/r45635/pdf-to-cbz-converter)

## Live Demo

Try the web version: [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## License

MIT License - Vincent Cruvellier
