FROM python:3.11-slim
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir fastmcp==2.12.4 mcp==1.15.0 uvicorn
COPY server.py /app/server.py
ENV PORT=8080
CMD ["sh","-c","fastmcp run /app/server.py --transport streamable-http --host 0.0.0.0 --port ${PORT:-8080}"]
